import { describe, expect, it } from "vitest";
import type { FindingGroup } from "../../src/lib/consensus";
import { evaluateGate, renderSummary } from "./report";

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
