import { describe, expect, it } from "vitest";
import type { FindingGroup } from "../../src/lib/consensus";
import { buildReport, evaluateGate, renderSummary } from "./report";

function group(overrides: Partial<FindingGroup> & { models: string[] }): FindingGroup {
  return {
    title: "Some finding",
    category: "bug",
    severity: "high",
    findings: overrides.models.map((model) => ({
      model,
      severity: overrides.severity ?? "high",
      category: overrides.category ?? "bug",
      title: overrides.title ?? "Some finding",
      description: "Description.",
    })),
    ...overrides,
  };
}

describe("evaluateGate", () => {
  it("never fails when fail_on_severity is none, regardless of findings", () => {
    const groups = [group({ severity: "high", models: ["a", "b", "c"] })];
    const result = evaluateGate(groups, { failOnSeverity: "none", minAgreement: 1 });

    expect(result.shouldFail).toBe(false);
    expect(result.reason).toBeNull();
  });

  it("excludes single-model findings regardless of severity when min_agreement is 2", () => {
    const groups = [
      group({ severity: "high", category: "security", models: ["only-one"] }),
    ];
    const result = evaluateGate(groups, { failOnSeverity: "high", minAgreement: 2 });

    expect(result.shouldFail).toBe(false);
    expect(result.gatingGroups).toHaveLength(0);
  });

  it("fails when a finding clears both the severity threshold and min_agreement", () => {
    const groups = [group({ severity: "high", models: ["a", "b"] })];
    const result = evaluateGate(groups, { failOnSeverity: "high", minAgreement: 2 });

    expect(result.shouldFail).toBe(true);
    expect(result.reason).toMatch(/1 finding/);
    expect(result.gatingGroups).toHaveLength(1);
  });

  it("does not count a medium-severity finding against a high threshold", () => {
    const groups = [group({ severity: "medium", models: ["a", "b", "c"] })];
    const result = evaluateGate(groups, { failOnSeverity: "high", minAgreement: 2 });

    expect(result.shouldFail).toBe(false);
  });

  it("counts medium and high findings against a medium threshold", () => {
    const groups = [
      group({ severity: "medium", models: ["a", "b"] }),
      group({ severity: "low", models: ["a", "b"] }),
    ];
    const result = evaluateGate(groups, { failOnSeverity: "medium", minAgreement: 2 });

    expect(result.shouldFail).toBe(true);
    expect(result.gatingGroups).toHaveLength(1);
    expect(result.gatingGroups[0].severity).toBe("medium");
  });

  it("pluralizes the reason correctly for a single gating finding", () => {
    const groups = [group({ severity: "high", models: ["a", "b"] })];
    const result = evaluateGate(groups, { failOnSeverity: "high", minAgreement: 2 });

    expect(result.reason).toBe(
      "1 finding at high severity or above with at least 2 models agreeing."
    );
  });
});

describe("renderSummary", () => {
  it("reports no findings plainly", () => {
    const summary = renderSummary([], 3);
    expect(summary).toContain("No findings.");
  });

  it("includes severity, category, agreement count, and title", () => {
    const groups = [
      group({
        title: "SQL injection in query builder",
        severity: "high",
        category: "security",
        models: ["claude-sonnet-5", "gpt-5.5"],
      }),
    ];
    const summary = renderSummary(groups, 3);

    expect(summary).toContain("SQL injection in query builder");
    expect(summary).toContain("[HIGH]");
    expect(summary).toContain("security");
    expect(summary).toContain("2/3 models agree");
  });

  it("labels an outlier finding", () => {
    const groups = [
      group({
        severity: "high",
        category: "security",
        models: ["claude-sonnet-5"],
      }),
    ];
    const summary = renderSummary(groups, 3);

    expect(summary).toContain("security outlier");
  });

  it("shows file and line, and assumption/rationale when present", () => {
    const groups: FindingGroup[] = [
      {
        title: "Unhandled promise rejection",
        category: "reliability",
        severity: "medium",
        models: ["claude-sonnet-5"],
        findings: [
          {
            model: "claude-sonnet-5",
            severity: "medium",
            category: "reliability",
            title: "Unhandled promise rejection",
            description: "The retry loop never catches a rejected promise.",
            file: "src/lib/retry.ts",
            line: 42,
            assumption: "Assumes callers do not already wrap this in a try/catch.",
            rationale: "The .catch() call is missing after the fetch chain.",
          },
        ],
      },
    ];
    const summary = renderSummary(groups, 1);

    expect(summary).toContain("src/lib/retry.ts · line 42");
    expect(summary).toContain("Assumes: Assumes callers do not already wrap this in a try/catch.");
    expect(summary).toContain("Why: The .catch() call is missing after the fetch chain.");
  });
});

describe("renderSummary with red-team verdicts", () => {
  const demonstrated = {
    demonstrated: true,
    exploit: "POST /users?id=1' OR '1'='1 returns every row.",
    reasoning: "The id parameter is concatenated straight into the query.",
  };

  it("labels a demonstrated finding and shows the exploit", () => {
    const groups = [group({ category: "security", models: ["a", "b"] })];
    const summary = renderSummary(groups, 3, [demonstrated]);

    expect(summary).toContain("exploit demonstrated");
    expect(summary).toContain("How this is exploited");
    expect(summary).toContain("The id parameter is concatenated");
    // Fenced so a payload cannot render as markdown in the job summary.
    expect(summary).toContain("```\nPOST /users?id=1' OR '1'='1 returns every row.\n```");
  });

  it("labels a finding the model could not demonstrate", () => {
    const groups = [group({ models: ["a", "b"] })];
    const summary = renderSummary(groups, 3, [
      {
        demonstrated: false,
        reasoning: "The value is validated by the caller two lines above.",
      },
    ]);

    expect(summary).toContain("not demonstrated");
    expect(summary).toContain("Why this could not be demonstrated");
    expect(summary).toContain("validated by the caller");
  });

  it("shows the missing fact for a needs-context verdict", () => {
    const groups = [group({ category: "security", models: ["a", "b"] })];
    const summary = renderSummary(groups, 3, [
      {
        demonstrated: false,
        verdict: "needs_context",
        missingFact: "Whether middleware.ts guards /admin.",
        reasoning: "The handler never checks the session itself.",
      },
    ]);

    expect(summary).toContain("needs context");
    expect(summary).toContain("What would settle this");
    expect(summary).toContain("```\nCheck: Whether middleware.ts guards /admin.\n```");
  });

  it("labels a refuted verdict", () => {
    const groups = [group({ models: ["a", "b"] })];
    const summary = renderSummary(groups, 3, [
      { demonstrated: false, verdict: "refuted", reasoning: "Parameterised query." },
    ]);

    expect(summary).toContain("refuted by the code");
    expect(summary).toContain("Why the code prevents this");
  });

  it("omits the section entirely for groups with no verdict", () => {
    const groups = [group({ models: ["a", "b"] }), group({ models: ["c"] })];
    const summary = renderSummary(groups, 3, [demonstrated, undefined]);

    expect(summary.match(/exploit demonstrated/g)).toHaveLength(1);
    expect(summary).not.toContain("not demonstrated");
  });

  it("renders unchanged when the pass did not run", () => {
    const groups = [group({ models: ["a", "b"] })];

    expect(renderSummary(groups, 3, undefined)).toBe(renderSummary(groups, 3));
  });
});

describe("renderSummary fences model-authored text", () => {
  // A model demonstrating an exploit routinely answers with a fenced code
  // block. A fixed ``` fence closes on the inner one, and the rest of the
  // exploit renders as markdown in the job summary — links included.
  it("survives an exploit containing its own code fence", () => {
    const exploit = "Send:\n```\n'; DROP TABLE users; --\n```\nand it runs.";
    const groups = [group({ severity: "high", models: ["a"] })];

    const out = renderSummary(groups, 1, [
      { demonstrated: true, exploit, reasoning: "Concatenated into SQL." },
    ]);

    // The wrapping fence has to outlast the longest run inside it.
    expect(out).toContain("````");
    const body = out.slice(out.indexOf("````"));
    const opening = body.slice(0, body.indexOf("\n"));
    expect(body.split(opening).length - 1).toBe(2);
    expect(out).toContain("'; DROP TABLE users; --");
  });

  it("fences reasoning too, so markdown in it cannot render", () => {
    const groups = [group({ severity: "high", models: ["a"] })];

    const out = renderSummary(groups, 1, [
      {
        demonstrated: false,
        reasoning: "Guarded by [a link](https://example.test/x).",
      },
    ]);

    const line = out.split("\n").findIndex((l) => l.includes("[a link]"));
    expect(out.split("\n")[line - 1]).toMatch(/^`{3,}$/);
  });
});

describe("buildReport", () => {
  const models = ["a", "b", "c"];
  const gateOptions = { failOnSeverity: "high" as const, minAgreement: 2 };

  function report(groups: FindingGroup[]) {
    return buildReport({
      title: "Upstream release: x v1 -> v2",
      models,
      modelRuns: { a: { ok: 2, failed: 0 }, b: { ok: 2, failed: 0 }, c: { ok: 1, failed: 1 } },
      batches: 2,
      droppedBatches: 0,
      groups,
      gate: evaluateGate(groups, gateOptions),
      gateOptions,
      generatedAt: "2026-10-10T00:00:00.000Z",
    });
  }

  it("carries the gate verdict and marks exactly the findings that tripped it", () => {
    const agreed = group({ title: "Agreed", severity: "high", category: "security", models: ["a", "b"] });
    const lone = group({ title: "Lone", severity: "high", category: "security", models: ["c"] });
    const out = report([agreed, lone]);

    expect(out.version).toBe(1);
    expect(out.gate.failed).toBe(true);
    expect(out.gate.reason).toContain("1 finding");
    expect(out.findings.map((f) => [f.title, f.agreement, f.gating, f.outlier])).toEqual([
      ["Agreed", "2/3", true, null],
      ["Lone", "1/3", false, "security outlier"],
    ]);
  });

  it("keeps per-model batch outcomes, so a reviewer that kept failing shows up", () => {
    const out = report([]);
    expect(out.modelRuns.c).toEqual({ ok: 1, failed: 1 });
    expect(out.gate.failed).toBe(false);
    expect(out.findings).toEqual([]);
  });

  it("serializes optional finding fields as null and round-trips through JSON", () => {
    const out = report([group({ models: ["a"] })]);
    const detail = JSON.parse(JSON.stringify(out)).findings[0].details[0];
    expect(detail).toEqual({
      model: "a",
      description: "Description.",
      file: null,
      line: null,
      assumption: null,
      rationale: null,
    });
  });
});
