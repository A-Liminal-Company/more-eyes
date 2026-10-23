/**
 * Job-summary rendering and gate evaluation. Pure — no @actions/core import
 * — so both are fixture-testable without mocking the Actions runtime. M2
 * scope only: sticky/inline PR comments are M3 (see docs/pr-action-design.md).
 */
import { outlierSignal, type FindingGroup, type ModelFinding } from "../../src/lib/consensus";
import { redTeamLabel, type RedTeamResult } from "../../src/lib/redteam";

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

/**
 * Wraps model-authored text in a fence long enough to survive its own contents.
 *
 * A fixed ``` fence breaks on ordinary output, not just hostile output: a model
 * asked to demonstrate an exploit routinely answers with a fenced code block, and
 * the inner fence closes the outer one early. Everything after it then renders as
 * markdown in the job summary — including any links it happens to contain. Both
 * fields get this: reasoning is model-authored too, and was previously raw.
 */
function fence(text: string): string {
  const longestRun = (text.match(/`+/g) ?? []).reduce(
    (max, run) => Math.max(max, run.length),
    0
  );
  const ticks = "`".repeat(Math.max(3, longestRun + 1));
  return `${ticks}\n${text}\n${ticks}`;
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
  const lines: string[] = ["## More Eyes", ""];

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
    const label = verdict ? redTeamLabel(verdict) : undefined;
    lines.push(`### [${group.severity.toUpperCase()}] ${group.title}`);
    lines.push("");
    lines.push(
      `*${group.category} · ${group.models.length}/${totalModels} models agree` +
        `${outlier ? ` · ${outlier}` : ""}` +
        `${label ? ` · ${label.badge}` : ""}*`
    );
    lines.push("");

    for (const finding of group.findings) {
      const location = findingLocation(finding);
      lines.push(`- **${finding.model}**${location ? ` (${location})` : ""}: ${finding.description}`);
      if (finding.assumption) lines.push(`  - Assumes: ${finding.assumption}`);
      if (finding.rationale) lines.push(`  - Why: ${finding.rationale}`);
    }

    if (verdict && label) {
      lines.push("");
      lines.push(`<details><summary>${label.heading}</summary>`);
      lines.push("");
      if (verdict.missingFact) {
        lines.push(fence(`Check: ${verdict.missingFact}`));
        lines.push("");
      }
      lines.push(fence(verdict.reasoning));
      if (verdict.exploit) {
        lines.push("");
        lines.push(fence(verdict.exploit));
      }
      lines.push("");
      lines.push("</details>");
    }

    lines.push("");
  });

  return lines.join("\n");
}

/** Per-model outcome across every batch: how many returned a review, how many failed. */
export type ModelRuns = Record<string, { ok: number; failed: number }>;

export type ReportInput = {
  title: string;
  models: string[];
  modelRuns: ModelRuns;
  batches: number;
  droppedBatches: number;
  groups: FindingGroup[];
  gate: GateResult;
  gateOptions: GateOptions;
  generatedAt: string;
};

/**
 * The machine-readable twin of renderSummary, written when `report_path` is set,
 * so dashboards and agents can read a run without scraping the job summary.
 * Every string that came from a model is untrusted: consumers must escape it.
 * Bump `version` on any breaking change to the shape.
 */
export function buildReport(input: ReportInput) {
  const gating = new Set(input.gate.gatingGroups);
  return {
    version: 1,
    title: input.title,
    generatedAt: input.generatedAt,
    models: input.models,
    modelRuns: input.modelRuns,
    batches: { reviewed: input.batches, dropped: input.droppedBatches },
    gate: {
      failOnSeverity: input.gateOptions.failOnSeverity,
      minAgreement: input.gateOptions.minAgreement,
      failed: input.gate.shouldFail,
      reason: input.gate.reason,
    },
    findings: input.groups.map((group) => ({
      title: group.title,
      category: group.category,
      severity: group.severity,
      models: group.models,
      agreement: `${group.models.length}/${input.models.length}`,
      gating: gating.has(group),
      outlier: outlierSignal(group),
      details: group.findings.map((finding) => ({
        model: finding.model,
        description: finding.description,
        file: finding.file ?? null,
        line: finding.line ?? null,
        assumption: finding.assumption ?? null,
        rationale: finding.rationale ?? null,
      })),
    })),
  };
}
