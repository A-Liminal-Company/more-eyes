import { describe, expect, it } from "vitest";
import { clientKeyFor } from "./client-key";

function requestWith(forwardedFor?: string) {
  return {
    headers: {
      get: (name: string) =>
        name === "x-forwarded-for" ? (forwardedFor ?? null) : null,
    },
  };
}

describe("clientKeyFor", () => {
  it("falls back to a fixed key when there is no proxy header", () => {
    expect(clientKeyFor(requestWith())).toBe("local");
    expect(clientKeyFor(requestWith(""))).toBe("local");
    expect(clientKeyFor(requestWith(" , "))).toBe("local");
  });

  it("uses the single entry a lone proxy wrote", () => {
    expect(clientKeyFor(requestWith("203.0.113.5"))).toBe("203.0.113.5");
  });

  it("reads the entry the trusted proxy appended, not the client's claim", () => {
    // The caller sent "X-Forwarded-For: 1.1.1.1"; the proxy appended the address
    // it actually saw. Taking the leftmost entry would return the forgery.
    expect(clientKeyFor(requestWith("1.1.1.1, 203.0.113.5"))).toBe(
      "203.0.113.5"
    );
  });

  it("gives a spoofing client the same key no matter what it sends", () => {
    const keys = [
      "attacker-a, 203.0.113.5",
      "attacker-b, 203.0.113.5",
      "a, b, c, d, 203.0.113.5",
    ].map((header) => clientKeyFor(requestWith(header)));

    expect(new Set(keys).size).toBe(1);
  });

  it("tolerates surrounding whitespace", () => {
    expect(clientKeyFor(requestWith("  1.1.1.1 ,  203.0.113.5  "))).toBe(
      "203.0.113.5"
    );
  });
});
