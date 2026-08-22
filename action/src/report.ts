/**
 * Job-summary rendering and gate evaluation. Pure — no @actions/core import
 * — so both are fixture-testable without mocking the Actions runtime. M2
 * scope only: sticky/inline PR comments are M3 (see docs/pr-action-design.md).
 */
import { outlierSignal, type FindingGroup, type ModelFinding } from "../../src/lib/consensus";
import type { RedTeamResult } from "../../src/lib/redteam";

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
 *
 * Deliberately blind to red-team verdicts. Demonstrability is reported, never
 * gated on: an undemonstrated finding can still be real, and a build that broke
 * because one model wrote a convincing exploit would make the signal something
 * to argue with rather than something to read.
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
 *
 * `redTeam` is index-aligned with `groups` and optional — absent entirely when
 * the pass is off, and holding `undefined` for groups it skipped or failed on.
 * Alignment is safe here, unlike in the web app: nothing is persisted and
 * re-read, so the array is built against the very same group objects in one
 * pass.
 */
export function renderSummary(
  groups: FindingGroup[],
  totalModels: number,
  redTeam?: (RedTeamResult | undefined)[]
): string {
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

  groups.forEach((group, i) => {
    const outlier = outlierSignal(group);
    const verdict = redTeam?.[i];
    lines.push(`### [${group.severity.toUpperCase()}] ${group.title}`);
    lines.push("");
    lines.push(
      `*${group.category} · ${group.models.length}/${totalModels} models agree` +
        `${outlier ? ` · ${outlier}` : ""}` +
        `${
          verdict
            ? ` · ${verdict.demonstrated ? "exploit demonstrated" : "not demonstrated"}`
            : ""
        }*`
    );
    lines.push("");

    for (const finding of group.findings) {
      const location = findingLocation(finding);
      lines.push(`- **${finding.model}**${location ? ` (${location})` : ""}: ${finding.description}`);
      if (finding.assumption) lines.push(`  - Assumes: ${finding.assumption}`);
      if (finding.rationale) lines.push(`  - Why: ${finding.rationale}`);
    }

    if (verdict) {
      lines.push("");
      lines.push(
        `<details><summary>${
          verdict.demonstrated
            ? "How this is exploited"
            : "Why this could not be demonstrated"
        }</summary>`
      );
      lines.push("");
      lines.push(verdict.reasoning);
      // Fenced: exploit text is often a payload, and a fence keeps it from being
      // rendered as markdown in the job summary.
      if (verdict.exploit) {
        lines.push("");
        lines.push("```");
        lines.push(verdict.exploit);
        lines.push("```");
      }
      lines.push("");
      lines.push("</details>");
    }

    lines.push("");
  });

  return lines.join("\n");
}
