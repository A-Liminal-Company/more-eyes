import { describe, expect, it } from "vitest";
import { capBatches, resolveDiffSource } from "./source";

describe("resolveDiffSource", () => {
  it("uses the pull request diff by default", () => {
    expect(resolveDiffSource({ diffPath: "", eventName: "pull_request", hasPullRequest: true }))
      .toEqual({ kind: "pr" });
  });

  it("skips a non-PR event when no diff file is given", () => {
    const source = resolveDiffSource({ diffPath: "", eventName: "push", hasPullRequest: false });
    expect(source.kind).toBe("skip");
  });

  it("prefers a diff file, on any event", () => {
    for (const eventName of ["pull_request", "workflow_dispatch", "push"]) {
      expect(resolveDiffSource({ diffPath: " upstream.diff ", eventName, hasPullRequest: false }))
        .toEqual({ kind: "file", path: "upstream.diff" });
    }
  });
});

describe("capBatches", () => {
  const batches = ["a", "b", "c", "d"];

  it("keeps everything when uncapped", () => {
    expect(capBatches(batches, 0)).toEqual({ kept: batches, dropped: 0 });
    expect(capBatches(batches, Number.NaN)).toEqual({ kept: batches, dropped: 0 });
  });

  it("keeps everything under the cap", () => {
    expect(capBatches(batches, 10)).toEqual({ kept: batches, dropped: 0 });
  });

  it("reports how many batches it dropped", () => {
    expect(capBatches(batches, 3)).toEqual({ kept: ["a", "b", "c"], dropped: 1 });
  });
});
