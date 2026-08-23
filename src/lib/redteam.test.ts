import { afterEach, describe, expect, it } from "vitest";
import { groupFindings, type FindingGroup, type ModelFinding } from "./consensus";
import {
  groupKey,
  keyMapFor,
  parseRedTeamResult,
  redTeamCategories,
  selectForRedTeam,
} from "./redteam";

function finding(
  model: string,
  title: string,
  overrides: Partial<ModelFinding> = {}
): ModelFinding {
  return {
    model,
    title,
    description: title,
    severity: "medium",
    category: "bug",
    ...overrides,
  } as ModelFinding;
}

function group(overrides: Partial<FindingGroup> & { models: string[] }): FindingGroup {
  return {
    title: "Some finding",
    category: "bug",
    severity: "medium",
    findings: overrides.models.map((model) =>
      finding(model, overrides.title ?? "Some finding", {
        severity: overrides.severity ?? "medium",
        category: overrides.category ?? "bug",
      })
    ),
    ...overrides,
  };
}

afterEach(() => {
  delete process.env.REDTEAM_CATEGORIES;
  delete process.env.REDTEAM_MAX_FINDINGS;
});

describe("redTeamCategories", () => {
  it("defaults to the categories where an exploit is a coherent request", () => {
    expect([...redTeamCategories()].sort()).toEqual([
      "bug",
      "reliability",
      "security",
    ]);
  });

  it("honours an explicit list, including widening to style", () => {
    process.env.REDTEAM_CATEGORIES = "security,style";
    expect([...redTeamCategories()].sort()).toEqual(["security", "style"]);
  });

  it("tolerates whitespace and casing", () => {
    process.env.REDTEAM_CATEGORIES = " Security , BUG ";
    expect([...redTeamCategories()].sort()).toEqual(["bug", "security"]);
  });

  it("drops unknown categories rather than failing", () => {
    process.env.REDTEAM_CATEGORIES = "security,not-a-category";
    expect([...redTeamCategories()]).toEqual(["security"]);
  });

  it("falls back to the default when nothing valid is left", () => {
    process.env.REDTEAM_CATEGORIES = "nonsense,,,";
    expect([...redTeamCategories()].sort()).toEqual([
      "bug",
      "reliability",
      "security",
    ]);
  });
});

describe("selectForRedTeam", () => {
  it("skips uncorroborated medium findings, which the focused view also hides", () => {
    expect(selectForRedTeam([group({ severity: "medium", models: ["a"] })])).toEqual(
      []
    );
  });

  it("selects corroborated findings", () => {
    const groups = [group({ severity: "medium", models: ["a", "b"] })];
    expect(selectForRedTeam(groups)).toHaveLength(1);
  });

  it("selects single-model high-severity and security findings", () => {
    const groups = [
      group({ severity: "high", models: ["a"] }),
      group({ severity: "low", category: "security", models: ["b"] }),
    ];
    expect(selectForRedTeam(groups)).toHaveLength(2);
  });

  it("excludes focused findings in a category outside the configured set", () => {
    const groups = [
      group({ severity: "high", category: "style", models: ["a"] }),
      group({ severity: "high", category: "bug", models: ["a"] }),
    ];

    const selected = selectForRedTeam(groups);

    expect(selected).toHaveLength(1);
    expect(selected[0].category).toBe("bug");
  });

  it("includes style once the category set is widened", () => {
    process.env.REDTEAM_CATEGORIES = "bug,style";
    const groups = [group({ severity: "high", category: "style", models: ["a"] })];

    expect(selectForRedTeam(groups)).toHaveLength(1);
  });

  it("caps the number of billed attempts", () => {
    process.env.REDTEAM_MAX_FINDINGS = "2";
    const groups = Array.from({ length: 5 }, (_, i) =>
      group({ severity: "high", title: `Finding ${i}`, models: ["a"] })
    );

    expect(selectForRedTeam(groups)).toHaveLength(2);
  });

  it("keeps the most serious findings when the cap bites", () => {
    process.env.REDTEAM_MAX_FINDINGS = "1";
    // groupFindings sorts by severity then agreement, so the caller hands them
    // over already ranked — the cap must not reorder that.
    const groups = groupFindings([
      finding("a", "Cache stampede under load", {
        severity: "medium",
        category: "reliability",
      }),
      finding("b", "Cache stampede under concurrent load", {
        severity: "medium",
        category: "reliability",
      }),
      finding("c", "Password compared with a non-constant-time equality check", {
        severity: "high",
        category: "security",
      }),
    ]);

    const selected = selectForRedTeam(groups);

    expect(selected).toHaveLength(1);
    expect(selected[0].severity).toBe("high");
  });
});

describe("selectForRedTeam budget", () => {
  // The Action reviews a large diff batch by batch, calling the pass once per
  // batch. If the cap reset each time, a 5-batch PR would bill 5x what the
  // setting says — a silent overrun on the one knob that bounds spend.
  // High severity so isFocused keeps them: the budget is what's under test,
  // not the focused-view gate that runs before it.
  const many = (n: number) =>
    Array.from({ length: n }, (_, i) =>
      group({ severity: "high", title: `Finding ${i}`, models: ["a"] })
    );

  it("honours a caller-supplied remainder instead of the configured cap", () => {
    expect(selectForRedTeam(many(6), 2)).toHaveLength(2);
  });

  it("selects nothing once the shared budget is spent", () => {
    expect(selectForRedTeam(many(6), 0)).toHaveLength(0);
    expect(selectForRedTeam(many(6), -1)).toHaveLength(0);
  });

  it("still applies the configured cap when no remainder is given", () => {
    process.env.REDTEAM_MAX_FINDINGS = "3";
    expect(selectForRedTeam(many(6))).toHaveLength(3);
    delete process.env.REDTEAM_MAX_FINDINGS;
  });
});

describe("groupKey", () => {
  it("is stable when the underlying findings arrive in a different order", () => {
    const a = finding("claude", "Division by zero not handled");
    const b = finding("gpt", "Division by zero is unhandled");

    const forward = groupFindings([a, b]);
    const reversed = groupFindings([b, a]);

    expect(forward).toHaveLength(1);
    expect(reversed).toHaveLength(1);
    expect(groupKey(forward[0], keyMapFor([a, b]))).toBe(
      groupKey(reversed[0], keyMapFor([b, a]))
    );
  });

  it("distinguishes groups with different members", () => {
    const a = finding("claude", "SQL injection in the user lookup", {
      category: "security",
    });
    const b = finding("gpt", "Race condition on the shared cache", {
      category: "reliability",
    });

    const groups = groupFindings([a, b]);
    const keyOf = keyMapFor([a, b]);

    expect(groups).toHaveLength(2);
    expect(groupKey(groups[0], keyOf)).not.toBe(groupKey(groups[1], keyOf));
  });

  it("returns null when the key map was built from different finding objects", () => {
    // The failure this guards against: a caller that rebuilds its findings
    // separately from the groups. The objects compare equal but are distinct
    // instances, and keyMapFor keys on identity, so every member misses. It
    // used to join to "" — a key that looks real, matches nothing, and reports
    // no error. Shipped once; caught only in a live run.
    const findings = [finding("claude", "Division by zero not handled")];
    const groups = groupFindings(findings);
    const rebuilt = findings.map((f) => ({ ...f }));

    expect(groupKey(groups[0], keyMapFor(rebuilt))).toBeNull();
  });

  it("returns null when only some members resolve", () => {
    // A partial key would be indistinguishable from a genuinely smaller
    // group's key, so it must not be produced at all.
    const a = finding("claude", "Division by zero not handled");
    const b = finding("gpt", "Division by zero is unhandled");
    const groups = groupFindings([a, b]);

    expect(groups[0].findings).toHaveLength(2);
    expect(groupKey(groups[0], keyMapFor([a]))).toBeNull();
  });

  it("distinguishes two findings from one model at different positions", () => {
    const first = finding("claude", "Unsafe cast at the top", { line: 3 });
    const second = finding("claude", "Totally separate overflow risk", {
      line: 90,
    });

    const groups = groupFindings([first, second]);
    const keyOf = keyMapFor([first, second]);

    expect(groups).toHaveLength(2);
    expect(groupKey(groups[0], keyOf)).not.toBe(groupKey(groups[1], keyOf));
  });
});

describe("parseRedTeamResult", () => {
  it("keeps a demonstrated verdict that carries a concrete exploit", () => {
    expect(
      parseRedTeamResult({
        demonstrated: true,
        exploit: "Pass b = 0 and the function throws.",
        reasoning: "The divisor is never checked.",
      })
    ).toEqual({
      demonstrated: true,
      exploit: "Pass b = 0 and the function throws.",
      reasoning: "The divisor is never checked.",
    });
  });

  it("downgrades a demonstrated claim with no exploit behind it", () => {
    // The whole point of the signal is that a confident yes must show its work.
    const result = parseRedTeamResult({
      demonstrated: true,
      reasoning: "Trust me, it is exploitable.",
    });

    expect(result?.demonstrated).toBe(false);
    expect(result?.exploit).toBeUndefined();
  });

  it("downgrades a demonstrated claim whose exploit is only whitespace", () => {
    expect(
      parseRedTeamResult({
        demonstrated: true,
        exploit: "   ",
        reasoning: "Exploitable.",
      })?.demonstrated
    ).toBe(false);
  });

  it("keeps an honest not-demonstrated verdict", () => {
    expect(
      parseRedTeamResult({
        demonstrated: false,
        reasoning: "The value is validated by the caller two lines above.",
      })
    ).toEqual({
      demonstrated: false,
      reasoning: "The value is validated by the caller two lines above.",
    });
  });

  it("returns null when there is neither reasoning nor an exploit", () => {
    expect(parseRedTeamResult({ demonstrated: false })).toBeNull();
    expect(parseRedTeamResult({})).toBeNull();
    expect(parseRedTeamResult(null)).toBeNull();
    expect(parseRedTeamResult("nope")).toBeNull();
  });

  it("treats a non-boolean demonstrated as not demonstrated", () => {
    expect(
      parseRedTeamResult({
        demonstrated: "true",
        exploit: "Something",
        reasoning: "Something",
      })?.demonstrated
    ).toBe(false);
  });
});
