import { describe, expect, it } from "vitest";
import { diffGroups, groupFindings, type ModelFinding } from "./consensus";

function finding(
  model: string,
  title: string,
  overrides: Partial<ModelFinding> = {}
): ModelFinding {
  return {
    model,
    title,
    // Deliberately not derived from the title — see consensus.test.ts for why.
    description: title,
    severity: "medium",
    category: "bug",
    ...overrides,
  } as ModelFinding;
}

describe("diffGroups", () => {
  it("marks identical groups persistent and nothing fixed", () => {
    const previous = groupFindings([
      finding("claude", "Division by zero not handled"),
      finding("gpt", "Division by zero is unhandled"),
    ]);
    const current = groupFindings([
      finding("claude", "Division by zero not handled"),
      finding("gpt", "Division by zero is unhandled"),
    ]);

    const { status, fixed } = diffGroups(current, previous);

    expect(status).toEqual(["persistent"]);
    expect(fixed).toEqual([]);
  });

  it("marks disjoint groups all new, with every previous group fixed", () => {
    const previous = groupFindings([
      finding("claude", "SQL injection in the user lookup query", {
        category: "security",
      }),
    ]);
    const current = groupFindings([
      finding("claude", "Race condition on shared cache", {
        category: "reliability",
      }),
    ]);

    const { status, fixed } = diffGroups(current, previous);

    expect(status).toEqual(["new"]);
    expect(fixed).toHaveLength(1);
    expect(fixed[0].title).toBe("SQL injection in the user lookup query");
  });

  it("matches paraphrased findings describing the same issue as persistent", () => {
    const previous = groupFindings([
      finding("claude", "Transitive merging can chain unrelated findings"),
    ]);
    const current = groupFindings([
      finding("gpt", "Transitive group merging can hide distinct issues"),
      finding("grok", "Transitive group merge can join unrelated issues"),
    ]);

    const { status, fixed } = diffGroups(current, previous);

    expect(status).toEqual(["persistent"]);
    expect(fixed).toEqual([]);
  });

  it("does not match near-identical titles across different categories", () => {
    const previous = groupFindings([
      finding("claude", "Unsanitized user input", { category: "security" }),
    ]);
    const current = groupFindings([
      finding("gpt", "Unsanitized user input", { category: "style" }),
    ]);

    const { status, fixed } = diffGroups(current, previous);

    expect(status).toEqual(["new"]);
    expect(fixed).toHaveLength(1);
  });

  it("returns an empty status array and no fixed groups for two empty inputs", () => {
    expect(diffGroups([], [])).toEqual({ status: [], fixed: [] });
  });

  it("treats every current group as new when there is no previous review", () => {
    const current = groupFindings([
      finding("claude", "Missing authorization check", {
        category: "security",
      }),
    ]);

    const { status, fixed } = diffGroups(current, []);

    expect(status).toEqual(["new"]);
    expect(fixed).toEqual([]);
  });

  it("keeps status index-aligned with the current groups array", () => {
    const previous = groupFindings([
      finding("claude", "Division by zero not handled"),
    ]);
    const current = groupFindings([
      finding("claude", "Division by zero not handled"),
      finding("gpt", "Totally unrelated variable naming issue", {
        category: "style",
      }),
    ]);

    const { status } = diffGroups(current, previous);

    expect(status).toHaveLength(current.length);
    expect(status[0]).toBe("persistent");
    expect(status[1]).toBe("new");
  });
});
