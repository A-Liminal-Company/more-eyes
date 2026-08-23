import type { Finding } from "./validation";

export type ModelFinding = Finding & { model: string };

/**
 * A grouping worked out once at submission time and stored on the Submission.
 *
 * Clustering runs on every render of the home page and every review page, so
 * anything that costs a model call cannot live inside `groupFindings` — it would
 * re-bill on each page view and make renders non-deterministic. The optional
 * model-assisted pass therefore runs once, at POST, and persists its answer
 * here as keys into the findings it grouped.
 */
export type ConsensusAssignment = { v: 1; groups: string[][] };

/** Identifies a finding within a submission: which model, and its position. */
export function findingKey(model: string, index: number): string {
  return `${model}#${index}`;
}

export function isConsensusAssignment(
  value: unknown
): value is ConsensusAssignment {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ConsensusAssignment>;
  return (
    candidate.v === 1 &&
    Array.isArray(candidate.groups) &&
    candidate.groups.every(
      (group) =>
        Array.isArray(group) && group.every((k) => typeof k === "string")
    )
  );
}

export type FindingGroup = {
  /** Representative title — taken from the highest-severity member. */
  title: string;
  category: Finding["category"];
  /** Highest severity any model assigned to this issue. */
  severity: Finding["severity"];
  /** Distinct models that independently flagged it, in input order. */
  models: string[];
  findings: ModelFinding[];
};

const SEVERITY_RANK: Record<Finding["severity"], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

// Words too common in review findings to carry signal.
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "be", "to", "of", "in", "on", "for",
  "and", "or", "not", "no", "with", "without", "this", "that", "it", "its",
  "can", "may", "will", "should", "could", "if", "when", "from", "by", "at",
  "as", "has", "have", "does", "do", "there", "here", "code", "function",
  "issue", "potential", "possible", "missing", "error",
]);

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/**
 * Thresholds are low because models paraphrase heavily. Three models describing
 * one issue as "Transitive merging can chain unrelated findings", "Transitive
 * group merging can hide distinct issues" and "Transitive group merge can join
 * unrelated issues" share only two tokens pairwise — 0.20 similarity for what is
 * plainly the same finding. Swept against the real fixture: tightening to 0.40
 * yields 14 groups and loosening to 0.18 yields 12, with the largest group
 * holding at 5 models either way, so this range is stable rather than a cliff.
 */
const TITLE_MATCH = 0.2;
/** Descriptions are longer, so overlap there is weaker evidence than in a title. */
const BODY_MATCH = 0.2;
/** A nearby reported line is corroborating evidence, so less overlap is needed. */
const NEARBY_LINE_MATCH = 0.15;
/** Models disagree by a line or two on where an issue starts. */
const LINE_TOLERANCE = 3;
/** Beyond this, two cited lines are treated as different places in the file. */
const DISTANT_LINES = 10;
/** Wording agreement strong enough to override the distance signal. */
const STRONG_MATCH = 0.4;

function distantLines(a: ModelFinding, b: ModelFinding): boolean {
  return (
    a.line != null &&
    b.line != null &&
    Math.abs(a.line - b.line) > DISTANT_LINES
  );
}

function nearbyLines(a: ModelFinding, b: ModelFinding): boolean {
  return (
    a.line != null &&
    b.line != null &&
    Math.abs(a.line - b.line) <= LINE_TOLERANCE
  );
}

/**
 * How strongly two findings look like the same issue. 0 means "not a match";
 * anything above is a usable score for picking the *best* group to join.
 */
function similarityScore(a: ModelFinding, b: ModelFinding): number {
  if (a.category !== b.category) return 0;

  const titleSimilarity = jaccard(tokenize(a.title), tokenize(b.title));
  const bodySimilarity = jaccard(
    tokenize(`${a.title} ${a.description}`),
    tokenize(`${b.title} ${b.description}`)
  );
  const best = Math.max(titleSimilarity, bodySimilarity);

  // Two findings that each name a specific, far-apart line are usually separate
  // instances of a similar problem rather than one issue — "unsafe cast" at
  // line 12 and line 88 are two casts. Nearby lines were already treated as
  // evidence for a match; distance is evidence against, and needs strong
  // wording agreement to overcome.
  if (distantLines(a, b) && best < STRONG_MATCH) return 0;

  if (titleSimilarity >= TITLE_MATCH) return best;
  if (bodySimilarity >= BODY_MATCH) return best;
  if (nearbyLines(a, b) && best >= NEARBY_LINE_MATCH) return best;

  return 0;
}

/** Mean similarity across every cross-group pair. */
function averageLinkage(a: ModelFinding[], b: ModelFinding[]): number {
  let total = 0;
  for (const x of a) for (const y of b) total += similarityScore(x, y);
  return total / (a.length * b.length);
}

/**
 * Two groups merge when their *average* cross-pair similarity clears this.
 *
 * Measured against the real fixture: the two halves of one split authorization
 * finding average 0.174 and must merge, while unrelated groups (SQL injection
 * against authorization) average 0.000. The gap is wide, so this sits below the
 * true positive with room to spare rather than being tuned to the edge.
 */
const MERGE_LINKAGE = 0.15;

/**
 * Merges groups that turn out to belong together, repeating until stable.
 *
 * A single assignment pass is order-dependent: a finding can start its own group
 * because the members it would have matched have not been seen yet. Observed in
 * a real run — one model's "Broken Access Control" split from three others'
 * "Missing authorization check" purely because it was processed first. Comparing
 * whole groups afterwards removes that dependence on input order.
 *
 * Uses average linkage, not single linkage. Merging whenever *any* one pair
 * matched let unrelated groups chain together through a single weak link —
 * A~B and B~C would fuse A with C even when A and C share nothing. Requiring the
 * average to clear the bar keeps the fix for order dependence while preserving
 * the property that over-splitting is the safer failure mode.
 *
 * This narrows chaining rather than eliminating it: a finding that genuinely
 * describes two issues still pulls both groups together, because its similarity
 * to each is real. That case is arguably a correct merge, but it means group
 * membership is not a partition of independent issues.
 */
function mergeRelatedGroups(groups: ModelFinding[][], seededCount = 0): void {
  let merged = true;
  while (merged) {
    merged = false;

    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        // Two groups the model deliberately kept apart are not re-joined by
        // lexical similarity — deciding they are distinct is the whole reason
        // the assignment exists. Merges are still indexed from the front, so a
        // seeded group only ever absorbs a lexical one, never the reverse.
        if (i < seededCount && j < seededCount) continue;
        if (averageLinkage(groups[i], groups[j]) >= MERGE_LINKAGE) {
          groups[i].push(...groups[j]);
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
}

/**
 * Clusters findings that different models reported about the same issue.
 *
 * Greedy single-pass clustering on category + title-token overlap. Deliberately
 * deterministic rather than model-assisted: grouping needs to be cheap, fast,
 * and testable, and a wrong grouping here is more misleading than no grouping.
 * Over-splitting is the safer failure mode — a missed match shows as two
 * single-model findings, which is merely redundant, whereas a bad merge hides
 * one issue behind another's title.
 */
/**
 * Keys a flat finding list the same way the submission route did when it wrote
 * the assignment: per-model position, in the order the findings were persisted.
 * Both sides derive keys from this so they cannot drift apart.
 */
export function keyFindings(reviews: ModelFinding[]): string[] {
  const seen = new Map<string, number>();
  return reviews.map((finding) => {
    const index = seen.get(finding.model) ?? 0;
    seen.set(finding.model, index + 1);
    return findingKey(finding.model, index);
  });
}

/**
 * Seeds groups from a stored assignment, returning them alongside whatever the
 * assignment did not account for.
 *
 * Findings the assignment does not mention still go through lexical clustering,
 * so a stale or partial assignment degrades rather than dropping findings. Keys
 * naming findings that no longer exist are simply skipped.
 */
function seedFromAssignment(
  reviews: ModelFinding[],
  assignment: ConsensusAssignment
): { groups: ModelFinding[][]; remaining: ModelFinding[] } {
  const keys = keyFindings(reviews);
  const byKey = new Map<string, ModelFinding>();
  keys.forEach((key, i) => byKey.set(key, reviews[i]));

  const claimed = new Set<string>();
  const groups: ModelFinding[][] = [];

  for (const group of assignment.groups) {
    const members: ModelFinding[] = [];
    for (const key of group) {
      const finding = byKey.get(key);
      // Skip unknown keys, and never let one finding land in two groups.
      if (!finding || claimed.has(key)) continue;
      claimed.add(key);
      members.push(finding);
    }
    if (members.length > 0) groups.push(members);
  }

  return {
    groups,
    remaining: reviews.filter((_, i) => !claimed.has(keys[i])),
  };
}

/**
 * Why a single-model finding deserves attention despite lacking corroboration.
 *
 * Agreement counting has a known failure mode: models sharing training biases
 * can converge on the same wrong answer while a lone dissenter holds the real
 * insight. Rather than burying single-model groups as "just one opinion", the
 * ones most likely to be a unique catch — security findings and high-severity
 * calls — get labeled as outliers worth a second look.
 */
export function outlierSignal(group: FindingGroup): string | null {
  if (group.models.length !== 1) return null;
  if (group.category === "security") return "security outlier";
  if (group.severity === "high") return "high-severity outlier";
  return null;
}

/**
 * Whether a group survives the focused view: corroborated, or a single-model
 * finding the research says is worth surfacing anyway (security, high severity).
 * What it excludes is the long tail of uncorroborated medium/low nitpicks — the
 * noise that trains people to ignore review tools.
 *
 * Shared rather than local to the review page because the red-team pass
 * (`src/lib/redteam.ts`) gates on exactly this predicate server-side. Two copies
 * would let the set of findings shown by default drift from the set that got an
 * exploit attempt, so a finding could carry a demonstrability verdict the user
 * never sees, or be shown without one it should have had.
 */
export function isFocused(group: FindingGroup): boolean {
  return (
    group.models.length > 1 ||
    group.severity === "high" ||
    group.category === "security"
  );
}

/**
 * Compares a resubmission's findings against the submission it re-reviews.
 *
 * `status` is index-aligned with `current`: `status[i]` describes `current[i]`.
 * A current group is "persistent" when it matches at least one previous group
 * by the same average-linkage test `mergeRelatedGroups` uses internally
 * (`averageLinkage(...) >= MERGE_LINKAGE`), and "new" otherwise. `fixed` is
 * every previous group that no current group matched — an issue that no longer
 * shows up.
 *
 * `similarityScore` returns 0 across differing categories, so `averageLinkage`
 * does too — the category check the design calls for falls out of the existing
 * matcher rather than needing a separate condition.
 *
 * Matching is lexical, the same as `groupFindings`, so it inherits the same
 * blind spot: a finding paraphrased differently between runs can fail to match
 * its predecessor and get counted "new" even though it is the same issue.
 * Over-reporting "new" (a miscount toward noise) is the safe failure mode here,
 * the same way over-splitting is the safe failure mode for `groupFindings` —
 * the alternative, wrongly marking a real regression "persistent" (or wrongly
 * calling a real issue "fixed"), is the one that actually misleads.
 */
export function diffGroups(
  current: FindingGroup[],
  previous: FindingGroup[]
): { status: ("new" | "persistent")[]; fixed: FindingGroup[] } {
  const matchedPrevious = new Set<number>();

  const status = current.map((currentGroup) => {
    let persistent = false;
    previous.forEach((previousGroup, i) => {
      if (averageLinkage(currentGroup.findings, previousGroup.findings) >= MERGE_LINKAGE) {
        persistent = true;
        matchedPrevious.add(i);
      }
    });
    return persistent ? "persistent" : "new";
  }) as ("new" | "persistent")[];

  const fixed = previous.filter((_, i) => !matchedPrevious.has(i));

  return { status, fixed };
}

export function groupFindings(
  reviews: ModelFinding[],
  assignment?: ConsensusAssignment | null
): FindingGroup[] {
  const seeded =
    assignment && isConsensusAssignment(assignment)
      ? seedFromAssignment(reviews, assignment)
      : null;

  const groups: ModelFinding[][] = seeded ? seeded.groups : [];
  // Captured before the loop appends to `groups`, which aliases `seeded.groups`.
  const seededCount = groups.length;

  for (const finding of seeded ? seeded.remaining : reviews) {
    // Best match, not first match. First-match lets a finding be absorbed by an
    // earlier weakly-related group before it is ever compared with the group it
    // actually belongs to, which fragmented real runs.
    let bestGroup: ModelFinding[] | null = null;
    let bestScore = 0;

    for (const group of groups) {
      const score = Math.max(
        ...group.map((member) => similarityScore(member, finding))
      );
      if (score > bestScore) {
        bestScore = score;
        bestGroup = group;
      }
    }

    if (bestGroup) bestGroup.push(finding);
    else groups.push([finding]);
  }

  mergeRelatedGroups(groups, seededCount);

  return groups
    .map((findings) => {
      const ranked = [...findings].sort(
        (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
      );
      const models: string[] = [];
      for (const f of findings) {
        if (!models.includes(f.model)) models.push(f.model);
      }
      return {
        title: ranked[0].title,
        category: ranked[0].category,
        severity: ranked[0].severity,
        models,
        findings,
      };
    })
    .sort((a, b) => {
      const bySeverity =
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (bySeverity !== 0) return bySeverity;
      // Within a severity, agreement first — corroborated issues deserve attention.
      return b.models.length - a.models.length;
    });
}
