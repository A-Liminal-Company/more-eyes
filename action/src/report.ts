/**
 * Job-summary rendering and gate evaluation. Pure — no @actions/core import
 * — so both are fixture-testable without mocking the Actions runtime. M2
 * scope only: sticky/inline PR comments are M3 (see docs/pr-action-design.md).
 */
import { outlierSignal, type FindingGroup, type ModelFinding } from "../../src/lib/consensus";

export type Severity = "high" | "medium" | "low";
export type FailOnSeverity = "none" | Severity;

const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export type GateOptions = {
  failOnSeverity: FailOnSeverity;
  minAgreement: number;
};

export type GateResult = {
  shouldFail: boolean;
  /** One-line reason for core.setFailed, or null when the gate did not trip. */
  reason: string | null;
  gatingGroups: FindingGroup[];
};

/**
 * Advisory by default (`failOnSeverity: "none"` never fails). Otherwise a
 * finding can only fail the run when its severity clears the threshold AND
 * at least `minAgreement` distinct models independently flagged it — a
 * single-model finding never breaks the build, however severe.
 */
export function evaluateGate(
  groups: FindingGroup[],
  opts: GateOptions
): GateResult {
  if (opts.failOnSeverity === "none") {
    return { shouldFail: false, reason: null, gatingGroups: [] };
  }

  const threshold = SEVERITY_RANK[opts.failOnSeverity];

  const gatingGroups = groups.filter(
    (group) =>
      SEVERITY_RANK[group.severity] <= threshold &&
      group.models.length >= opts.minAgreement
  );

  if (gatingGroups.length === 0) {
    return { shouldFail: false, reason: null, gatingGroups: [] };
  }

  return {
    shouldFail: true,
    reason:
      `${gatingGroups.length} finding${gatingGroups.length === 1 ? "" : "s"} at ` +
      `${opts.failOnSeverity} severity or above with at least ${opts.minAgreement} ` +
      `model${opts.minAgreement === 1 ? "" : "s"} agreeing.`,
    gatingGroups,
  };
}

function findingLocation(finding: ModelFinding): string {
  if (finding.file && finding.line != null) return `${finding.file} · line ${finding.line}`;
  if (finding.file) return finding.file;
  if (finding.line != null) return `line ${finding.line}`;
  return "";
}

/**
 * Renders the job-summary markdown: per group, severity/category/agreement,
 * outlier label when present, title, and per-model description with
 * file·line and assumption/rationale when present. `totalModels` is the
 * number of models configured to run (the denominator in "K/N models"),
 * not the count that happened to succeed on any one batch.
 */
export function renderSummary(groups: FindingGroup[], totalModels: number): string {
  const lines: string[] = ["## Code Review Consensus", ""];

  if (groups.length === 0) {
    lines.push("No findings.");
    return `${lines.join("\n")}\n`;
  }

  lines.push(
    `${groups.length} finding${groups.length === 1 ? "" : "s"} across ${totalModels} model${
      totalModels === 1 ? "" : "s"
    }.`,
    ""
  );

  for (const group of groups) {
    const outlier = outlierSignal(group);
    lines.push(`### [${group.severity.toUpperCase()}] ${group.title}`);
    lines.push("");
    lines.push(
      `*${group.category} · ${group.models.length}/${totalModels} models agree` +
        `${outlier ? ` · ${outlier}` : ""}*`
    );
    lines.push("");

    for (const finding of group.findings) {
      const location = findingLocation(finding);
      lines.push(`- **${finding.model}**${location ? ` (${location})` : ""}: ${finding.description}`);
      if (finding.assumption) lines.push(`  - Assumes: ${finding.assumption}`);
      if (finding.rationale) lines.push(`  - Why: ${finding.rationale}`);
    }

    lines.push("");
  }

  return lines.join("\n");
}
