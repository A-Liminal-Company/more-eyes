import { describe, expect, it } from "vitest";
import { assignmentFromClusters } from "./consensus-llm";
import {
  groupFindings,
  isConsensusAssignment,
  keyFindings,
  type ModelFinding,
} from "./consensus";

function finding(
  model: string,
  title: string,
  description = title
): ModelFinding {
  return {
    model,
    title,
    description,
    severity: "high",
    category: "bug",
  };
}

/**
 * The case C-7 describes: one defect, three models, no shared vocabulary. These
 * are deliberately chosen so lexical clustering cannot group them.
 */
const PARAPHRASED = [
  finding("model-a", "Transitive merging can chain unrelated findings"),
  finding("model-b", "Group combination may hide distinct issues"),
  finding("model-c", "Weak links join separate problems together"),
];

describe("lexical grouping without an assignment", () => {
  it("splits paraphrases that share no vocabulary", () => {
    // Establishes the baseline the merge pass exists to fix. If this ever
    // starts passing as one group, the assignment tests below prove less.
    expect(groupFindings(PARAPHRASED)).toHaveLength(3);
  });

  it("is unchanged by a null or absent assignment", () => {
    expect(groupFindings(PARAPHRASED, null)).toHaveLength(3);
    expect(groupFindings(PARAPHRASED, undefined)).toHaveLength(3);
  });
});

describe("groupFindings with a stored assignment", () => {
  it("groups paraphrases that lexical matching splits", () => {
    const keys = keyFindings(PARAPHRASED);
    const groups = groupFindings(PARAPHRASED, { v: 1, groups: [keys] });

    expect(groups).toHaveLength(1);
    expect(groups[0].models).toEqual(["model-a", "model-b", "model-c"]);
  });

  it("keeps groups the assignment deliberately left apart", () => {
    // Two findings similar enough that lexical merging would fuse them.
    const findings = [
      finding("model-a", "SQL injection in the query builder"),
      finding("model-b", "SQL injection in the query builder"),
    ];
    const [first, second] = keyFindings(findings);

    expect(groupFindings(findings)).toHaveLength(1);
    expect(
      groupFindings(findings, { v: 1, groups: [[first], [second]] })
    ).toHaveLength(2);
  });

  it("clusters findings the assignment does not mention", () => {
    const findings = [
      ...PARAPHRASED,
      finding("model-a", "Unbounded cache growth in the session store"),
      finding("model-b", "Unbounded cache growth in the session store"),
    ];
    const keys = keyFindings(findings);

    const groups = groupFindings(findings, {
      v: 1,
      groups: [[keys[0], keys[1], keys[2]]],
    });

    // The assigned trio, plus the unmentioned pair grouped lexically.
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.models.length).sort()).toEqual([2, 3]);
  });

  it("ignores keys naming findings that no longer exist", () => {
    const keys = keyFindings(PARAPHRASED);
    const groups = groupFindings(PARAPHRASED, {
      v: 1,
      groups: [[...keys, "model-z#7", "model-a#99"]],
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].findings).toHaveLength(3);
  });

  it("never places one finding in two groups", () => {
    const keys = keyFindings(PARAPHRASED);
    const groups = groupFindings(PARAPHRASED, {
      v: 1,
      groups: [[keys[0], keys[1]], [keys[1], keys[2]]],
    });

    expect(groups.flatMap((g) => g.findings)).toHaveLength(3);
  });

  it("loses no findings for any assignment shape", () => {
    const keys = keyFindings(PARAPHRASED);
    for (const groups of [[], [[keys[0]]], [keys], [["nonsense"]]]) {
      const result = groupFindings(PARAPHRASED, { v: 1, groups });
      expect(result.flatMap((g) => g.findings)).toHaveLength(3);
    }
  });
});

describe("isConsensusAssignment", () => {
  it("accepts a well-formed assignment", () => {
    expect(isConsensusAssignment({ v: 1, groups: [["a#0"]] })).toBe(true);
    expect(isConsensusAssignment({ v: 1, groups: [] })).toBe(true);
  });

  it("rejects anything else, including a future version", () => {
    for (const value of [
      null,
      undefined,
      "assignment",
      {},
      { v: 2, groups: [] },
      { v: 1, groups: "a" },
      { v: 1, groups: [["a", 3]] },
    ]) {
      expect(isConsensusAssignment(value)).toBe(false);
    }
  });
});

describe("assignmentFromClusters", () => {
  const findings = [
    finding("model-a", "Alpha issue"),
    finding("model-b", "Beta issue"),
    finding("model-c", "Gamma issue"),
  ];
  const groups = groupFindings(findings);

  it("turns group indices into finding keys", () => {
    const assignment = assignmentFromClusters(groups, [[0, 1], [2]], findings);

    expect(isConsensusAssignment(assignment)).toBe(true);
    expect(assignment.groups).toHaveLength(2);
    expect(assignment.groups[0]).toHaveLength(2);
  });

  it("keeps groups the model failed to place", () => {
    const assignment = assignmentFromClusters(groups, [[0]], findings);

    // 1 and 2 were omitted entirely; they survive as their own groups.
    expect(assignment.groups.flat()).toHaveLength(3);
    expect(assignment.groups).toHaveLength(3);
  });

  it("drops out-of-range, repeated, and non-integer indices", () => {
    const assignment = assignmentFromClusters(
      groups,
      [[0, 99, -1, 1.5], [0, 1], [2]],
      findings
    );

    expect(assignment.groups.flat()).toHaveLength(3);
    expect(new Set(assignment.groups.flat()).size).toBe(3);
  });

  it("round-trips back through groupFindings", () => {
    const assignment = assignmentFromClusters(groups, [[0, 1, 2]], findings);

    expect(groupFindings(findings, assignment)).toHaveLength(1);
  });

  it("refuses to merge two findings the same model filed separately", () => {
    // Observed on the real fixture: one model reported "no check for user
    // existence" and "no input validation on email field" as two findings, and
    // the merge pass fused them behind a third model's broader title. A model
    // filing two findings is evidence they are two issues.
    // Worded so lexical matching keeps all three apart, isolating the guard.
    const sameModel = [
      finding("model-a", "No check for user existence"),
      finding("model-a", "Email field accepts arbitrary strings"),
      finding("model-b", "Missing input validation"),
    ];
    const lexical = groupFindings(sameModel);
    expect(lexical).toHaveLength(3);

    // The model asks for all three in one cluster; only two may combine.
    const assignment = assignmentFromClusters(lexical, [[0, 1, 2]], sameModel);
    const merged = groupFindings(sameModel, assignment);

    for (const group of merged) {
      const models = group.findings.map((f) => f.model);
      expect(new Set(models).size).toBe(models.length);
    }
    expect(merged.flatMap((g) => g.findings)).toHaveLength(3);
  });

  it("still merges when no model appears twice", () => {
    const distinct = [
      finding("model-a", "Returns the entire user row"),
      finding("model-b", "SELECT * may leak sensitive columns"),
    ];
    const lexical = groupFindings(distinct);
    expect(lexical).toHaveLength(2);

    const assignment = assignmentFromClusters(lexical, [[0, 1]], distinct);
    expect(groupFindings(distinct, assignment)).toHaveLength(1);
  });
});
