import type { Finding } from "./validation";

export type ModelFinding = Finding & { model: string };

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

const TITLE_MATCH = 0.4;
/** Titles vary far more than descriptions — "Broken Access Control" vs "Missing
 * authorization check" describe one issue with almost no shared tokens — so the
 * description text is also compared, at a stricter threshold since it is longer. */
const BODY_MATCH = 0.3;
/** A nearby reported line is corroborating evidence, so less overlap is needed. */
const NEARBY_LINE_MATCH = 0.15;
/** Models disagree by a line or two on where an issue starts. */
const LINE_TOLERANCE = 3;

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

  if (titleSimilarity >= TITLE_MATCH) return best;
  if (bodySimilarity >= BODY_MATCH) return best;
  if (nearbyLines(a, b) && best >= NEARBY_LINE_MATCH) return best;

  return 0;
}

/**
 * Merges groups that turn out to belong together, repeating until stable.
 *
 * A single assignment pass is order-dependent: a finding can start its own group
 * because the members it would have matched have not been seen yet. Observed in
 * a real run — one model's "Broken Access Control" split from three others'
 * "Missing authorization check" purely because it was processed first. Comparing
 * whole groups afterwards removes that dependence on input order.
 */
function mergeRelatedGroups(groups: ModelFinding[][]): void {
  let merged = true;
  while (merged) {
    merged = false;

    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const related = groups[i].some((a) =>
          groups[j].some((b) => similarityScore(a, b) > 0)
        );

        if (related) {
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
export function groupFindings(reviews: ModelFinding[]): FindingGroup[] {
  const groups: ModelFinding[][] = [];

  for (const finding of reviews) {
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

  mergeRelatedGroups(groups);

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
