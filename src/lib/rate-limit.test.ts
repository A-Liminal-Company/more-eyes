import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimit } from "./rate-limit";

beforeEach(() => {
  resetRateLimit();
});

describe("checkRateLimit", () => {
  it("allows requests up to the budget", () => {
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit("client").allowed).toBe(true);
    }
  });

  it("blocks the request that would exceed the budget", () => {
    for (let i = 0; i < 30; i++) checkRateLimit("client");

    const result = checkRateLimit("client");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("charges the given cost rather than one per call", () => {
    expect(checkRateLimit("client", 6).allowed).toBe(true);
    expect(checkRateLimit("client", 6).allowed).toBe(true);
    expect(checkRateLimit("client", 6).allowed).toBe(true);
    expect(checkRateLimit("client", 6).allowed).toBe(true);
    expect(checkRateLimit("client", 6).allowed).toBe(true);

    // 30 spent — a sixth six-model request does not fit.
    expect(checkRateLimit("client", 6).allowed).toBe(false);
  });

  it("rejects a single request that alone exceeds the budget", () => {
    expect(checkRateLimit("client", 31).allowed).toBe(false);
  });

  it("does not consume budget when a request is rejected", () => {
    checkRateLimit("client", 30);
    expect(checkRateLimit("client", 5).allowed).toBe(false);
    expect(checkRateLimit("client", 5).allowed).toBe(false);

    // The rejected attempts must not have been charged, so the window still
    // holds exactly the original 30.
    resetRateLimit();
    expect(checkRateLimit("client", 30).allowed).toBe(true);
  });

  it("tracks clients independently", () => {
    for (let i = 0; i < 30; i++) checkRateLimit("noisy");

    expect(checkRateLimit("noisy").allowed).toBe(false);
    expect(checkRateLimit("quiet").allowed).toBe(true);
  });

  it("reports a retry delay within the window", () => {
    checkRateLimit("client", 30);
    const { retryAfterSeconds } = checkRateLimit("client", 1);

    expect(retryAfterSeconds).toBeGreaterThan(0);
    expect(retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});
