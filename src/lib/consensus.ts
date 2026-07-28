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

const STRONG_MATCH = 0.4;
/** Same reported line is corroborating evidence, so less title overlap is needed. */
const SAME_LINE_MATCH = 0.2;

function isSameIssue(a: ModelFinding, b: ModelFinding): boolean {
  if (a.category !== b.category) return false;

  const similarity = jaccard(tokenize(a.title), tokenize(b.title));
  if (similarity >= STRONG_MATCH) return true;

  const sameLine =
    a.line != null && b.line != null && a.line === b.line;
  return sameLine && similarity >= SAME_LINE_MATCH;
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
    const existing = groups.find((group) =>
      group.some((member) => isSameIssue(member, finding))
    );
    if (existing) existing.push(finding);
    else groups.push([finding]);
  }

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
