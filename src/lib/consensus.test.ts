import { describe, expect, it } from "vitest";
import { groupFindings, type ModelFinding } from "./consensus";

function finding(
  model: string,
  title: string,
  overrides: Partial<ModelFinding> = {}
): ModelFinding {
  return {
    model,
    title,
    // Deliberately not derived from the title: generating it as
    // `${title} description` made every synthetic finding share a filler token,
    // manufacturing overlap that real model output does not have.
    description: title,
    severity: "medium",
    category: "bug",
    ...overrides,
  } as ModelFinding;
}

describe("groupFindings", () => {
  it("returns an empty array for no findings", () => {
    expect(groupFindings([])).toEqual([]);
  });

  it("groups the same issue reported by different models", () => {
    const groups = groupFindings([
      finding("claude", "Division by zero not handled"),
      finding("gpt", "Division by zero is unhandled"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].models).toEqual(["claude", "gpt"]);
  });

  it("keeps unrelated issues in separate groups", () => {
    const groups = groupFindings([
      finding("claude", "Division by zero not handled"),
      finding("gpt", "Variable naming is inconsistent"),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("never groups findings from different categories", () => {
    const groups = groupFindings([
      finding("claude", "Unsanitized user input", { category: "security" }),
      finding("gpt", "Unsanitized user input", { category: "style" }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("groups weakly-similar titles when both cite the same line", () => {
    const groups = groupFindings([
      finding("claude", "Unsafe cast here", { line: 12 }),
      finding("gpt", "Cast is unchecked", { line: 12 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].models).toEqual(["claude", "gpt"]);
  });

  it("does not group weakly-similar titles on different lines", () => {
    const groups = groupFindings([
      finding("claude", "Unsafe cast here", {
        line: 12,
        description: "The numeric conversion drops precision.",
      }),
      finding("gpt", "Cast is unchecked", {
        line: 88,
        description: "A completely unrelated serialization concern.",
      }),
    ]);

    expect(groups).toHaveLength(2);
  });

  it("adopts the highest severity reported for an issue", () => {
    const groups = groupFindings([
      finding("claude", "Division by zero not handled", { severity: "low" }),
      finding("gpt", "Division by zero is unhandled", { severity: "high" }),
    ]);

    expect(groups[0].severity).toBe("high");
    expect(groups[0].title).toBe("Division by zero is unhandled");
  });

  it("orders by severity, then by how many models agree", () => {
    const groups = groupFindings([
      finding("claude", "Naming is unclear", { severity: "low" }),
      finding("claude", "Solo high severity problem", { severity: "high" }),
      finding("gpt", "Race condition on shared cache", { severity: "high" }),
      finding("grok", "Race condition in the shared cache", {
        severity: "high",
      }),
    ]);

    expect(groups[0].models).toHaveLength(2);
    expect(groups[0].severity).toBe("high");
    expect(groups[1].severity).toBe("high");
    expect(groups.at(-1)?.severity).toBe("low");
  });

  it("counts a model once even if it reports the issue twice", () => {
    const groups = groupFindings([
      finding("claude", "Division by zero not handled"),
      finding("claude", "Division by zero unhandled"),
    ]);

    expect(groups[0].models).toEqual(["claude"]);
    expect(groups[0].findings).toHaveLength(2);
  });

  it("does not merge on shared stopwords alone", () => {
    const groups = groupFindings([
      finding("claude", "Missing error handling in the code"),
      finding("gpt", "Missing return type in the code"),
    ]);

    expect(groups).toHaveLength(2);
  });

  // Found by running this file through the review app itself: two models
  // independently flagged that single-link merging let unrelated groups chain
  // together through one weak pair. Average linkage fixes the weak-link case.
  // A finding that genuinely describes both issues still merges them, which is
  // arguably correct — see the note on mergeRelatedGroups.
  it("keeps two well-formed groups separate", () => {
    const groups = groupFindings([
      finding("claude", "SQL injection in the user lookup query", {
        category: "security",
        description: "Interpolated request input reaches the SQL query.",
      }),
      finding("gpt", "SQL injection in the user lookup", {
        category: "security",
        description: "Interpolated request input reaches the SQL query directly.",
      }),
      finding("grok", "SQL injection in user lookup path", {
        category: "security",
        description: "Interpolated request input reaches the SQL query path.",
      }),
      finding("deepseek", "Session cookie secure flag not set", {
        category: "security",
        description: "Session cookie secure flag is not set on the cookie.",
      }),
      finding("gemini", "Session cookie secure flag missing", {
        category: "security",
        description: "Session cookie secure flag is not set on the cookie value.",
      }),
      finding("qwen", "Session cookie secure flag absent", {
        category: "security",
        description: "Session cookie secure flag is not set on the cookie object.",
      }),
    ]);

    expect(groups).toHaveLength(2);
    for (const group of groups) {
      expect(group.models).toHaveLength(3);
    }
  });
});
