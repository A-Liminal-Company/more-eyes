import { describe, expect, it } from "vitest";
import realFindings from "./__fixtures__/real-review.json";
import { groupFindings, type ModelFinding } from "./consensus";

/**
 * Regression suite built from an actual five-model run against a deliberately
 * buggy Express snippet. Synthetic fixtures make clustering look easier than it
 * is — real models title the same issue in wildly different ways ("Broken
 * Access Control" vs "Missing authorization check"), which is exactly what the
 * matcher has to survive.
 */
const findings = realFindings as ModelFinding[];
const groups = groupFindings(findings);

function groupContaining(substring: string) {
  return groups.filter((g) =>
    g.findings.some((f) =>
      `${f.title} ${f.description}`
        .toLowerCase()
        .includes(substring.toLowerCase())
    )
  );
}

describe("groupFindings on real multi-model output", () => {
  it("uses the full fixture", () => {
    expect(findings.length).toBeGreaterThan(30);
    expect(new Set(findings.map((f) => f.model)).size).toBe(5);
  });

  it("collapses the SQL injection issue into a single group", () => {
    const sqlGroups = groupContaining("sql injection");
    expect(sqlGroups).toHaveLength(1);
    expect(sqlGroups[0].models.length).toBeGreaterThanOrEqual(5);
    expect(sqlGroups[0].severity).toBe("high");
  });

  it("collapses the missing-authorization issue into a single group", () => {
    // Previously split: "Missing authorization check" (3 models) and
    // "Broken Access Control" (2 models) were the same finding.
    const authGroups = groups.filter(
      (g) =>
        g.category === "security" &&
        g.findings.some((f) =>
          /authoriz|access control|authenticat/i.test(
            `${f.title} ${f.description}`
          )
        ) &&
        g.findings.some((f) => /email/i.test(`${f.title} ${f.description}`))
    );

    expect(authGroups).toHaveLength(1);
    expect(authGroups[0].models.length).toBeGreaterThanOrEqual(4);
  });

  it("keeps SQL injection and authorization as distinct issues", () => {
    const sql = groupContaining("sql injection")[0];
    const auth = groups.find(
      (g) =>
        g !== sql &&
        g.category === "security" &&
        g.findings.some((f) => /authoriz|access control/i.test(f.title))
    );

    expect(auth).toBeDefined();
    expect(auth).not.toBe(sql);
  });

  it("meaningfully reduces 33 raw findings without collapsing everything", () => {
    expect(groups.length).toBeLessThan(findings.length);
    // Over-merging is the dangerous direction — it hides one issue behind
    // another's title. Guard against the matcher becoming too permissive.
    expect(groups.length).toBeGreaterThan(5);
  });

  it("never places two findings from one model in a group claiming agreement", () => {
    for (const group of groups) {
      const modelCounts = new Set(group.findings.map((f) => f.model));
      expect(group.models.length).toBe(modelCounts.size);
    }
  });

  it("orders high severity first", () => {
    expect(groups[0].severity).toBe("high");
  });
});
