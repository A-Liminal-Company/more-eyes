import { describe, expect, it } from "vitest";
import { parseFindings, sortFindings } from "./types";
import type { Finding } from "./validation";

describe("parseFindings", () => {
  it("passes through an array of findings", () => {
    const findings = parseFindings([{ severity: "low", category: "style" }]);
    expect(findings).toHaveLength(1);
  });

  it("returns an empty array for a non-array value", () => {
    expect(parseFindings({ foo: "bar" })).toEqual([]);
  });

  it("returns an empty array for null", () => {
    expect(parseFindings(null)).toEqual([]);
  });
});

describe("sortFindings", () => {
  it("orders high, then medium, then low", () => {
    const findings = [
      { severity: "low" },
      { severity: "high" },
      { severity: "medium" },
    ] as Finding[];

    const sorted = sortFindings(findings).map((f) => f.severity);
    expect(sorted).toEqual(["high", "medium", "low"]);
  });

  it("does not mutate the input array", () => {
    const findings = [{ severity: "low" }, { severity: "high" }] as Finding[];
    const original = [...findings];
    sortFindings(findings);
    expect(findings).toEqual(original);
  });
});
