import { describe, expect, it } from "vitest";
import type { FindingGroup } from "./consensus";
import { computeModelStats } from "./model-stats";

function group(
  members: { model: string; severity?: FindingGroup["severity"] }[]
): FindingGroup {
  const models: string[] = [];
  for (const m of members) {
    if (!models.includes(m.model)) models.push(m.model);
  }
  return {
    title: "t",
    category: "bug",
    severity: members[0]?.severity ?? "medium",
    models,
    findings: members.map((m) => ({
      model: m.model,
      title: "t",
      description: "d",
      severity: m.severity ?? "medium",
      category: "bug",
    })),
  };
}

describe("computeModelStats", () => {
  it("returns an empty list with no submissions", () => {
    expect(computeModelStats([])).toEqual([]);
  });

  it("counts corroborated vs isolated findings per model", () => {
    const stats = computeModelStats([
      {
        reviews: [
          { model: "claude", status: "ok" },
          { model: "gpt", status: "ok" },
        ],
        groups: [
          group([{ model: "claude" }, { model: "gpt" }]),
          group([{ model: "claude" }]),
        ],
      },
    ]);

    const claude = stats.find((s) => s.model === "claude");
    const gpt = stats.find((s) => s.model === "gpt");

    expect(claude).toMatchObject({
      reviews: 1,
      failures: 0,
      findings: 2,
      corroborated: 1,
      corroborationRate: 0.5,
    });
    expect(gpt).toMatchObject({
      findings: 1,
      corroborated: 1,
      corroborationRate: 1,
    });
  });

  it("counts failures separately from usable reviews", () => {
    const stats = computeModelStats([
      {
        reviews: [{ model: "grok", status: "failed" }],
        groups: [],
      },
      {
        reviews: [{ model: "grok", status: "ok" }],
        groups: [group([{ model: "grok" }])],
      },
    ]);

    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({
      model: "grok",
      reviews: 1,
      failures: 1,
      findings: 1,
      corroborated: 0,
      corroborationRate: 0,
    });
  });

  it("uses null rate for a model with reviews but no findings", () => {
    const stats = computeModelStats([
      {
        reviews: [{ model: "gemini", status: "ok" }],
        groups: [],
      },
    ]);

    expect(stats[0].corroborationRate).toBeNull();
  });

  it("aggregates across submissions and sorts by rate", () => {
    const stats = computeModelStats([
      {
        reviews: [
          { model: "claude", status: "ok" },
          { model: "gpt", status: "ok" },
        ],
        groups: [group([{ model: "claude" }, { model: "gpt" }])],
      },
      {
        reviews: [
          { model: "claude", status: "ok" },
          { model: "gpt", status: "ok" },
        ],
        groups: [group([{ model: "gpt" }])],
      },
    ]);

    expect(stats.map((s) => s.model)).toEqual(["claude", "gpt"]);
    expect(stats[0].corroborationRate).toBe(1);
    expect(stats[1].corroborationRate).toBe(0.5);
  });

  it("counts a model once per group even with two findings in it", () => {
    const stats = computeModelStats([
      {
        reviews: [
          { model: "claude", status: "ok" },
          { model: "gpt", status: "ok" },
        ],
        groups: [
          group([{ model: "claude" }, { model: "claude" }, { model: "gpt" }]),
        ],
      },
    ]);

    const claude = stats.find((s) => s.model === "claude");
    expect(claude).toMatchObject({ findings: 2, corroborated: 2 });
  });
});
