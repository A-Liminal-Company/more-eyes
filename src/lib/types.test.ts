import { describe, expect, it } from "vitest";
import { parseFindings, sortFindings } from "./types";
import type { Finding } from "./validation";

describe("parseFindings", () => {
  it("parses a valid JSON array", () => {
    const findings = parseFindings(
      JSON.stringify([{ severity: "low", category: "style" }])
    );
    expect(findings).toHaveLength(1);
  });

  it("returns an empty array for malformed JSON", () => {
    expect(parseFindings("not json")).toEqual([]);
  });

  it("returns an empty array when JSON is not an array", () => {
    expect(parseFindings(JSON.stringify({ foo: "bar" }))).toEqual([]);
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
