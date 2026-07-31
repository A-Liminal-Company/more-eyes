import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit, rateLimitSize, resetRateLimit } from "./rate-limit";

beforeEach(() => {
  resetRateLimit();
});

afterEach(() => {
  vi.useRealTimers();
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

describe("global ceiling", () => {
  it("bounds total spend even when every request uses a fresh key", () => {
    // Each key gets its own 30-call budget, so per-client limits alone would
    // never fire here. Something has to stop it — that is the global bucket.
    let allowed = 0;
    for (let i = 0; i < 100; i++) {
      if (checkRateLimit(`key-${i}`, 6).allowed) allowed++;
    }

    expect(allowed * 6).toBeLessThanOrEqual(120);
  });

  it("does not interfere with a single client's own budget", () => {
    for (let i = 0; i < 30; i++) {
      expect(checkRateLimit("client").allowed).toBe(true);
    }
  });

  it("reports a retry delay when only the global bucket is exhausted", () => {
    for (let i = 0; i < 4; i++) checkRateLimit(`key-${i}`, 30);

    const { allowed, retryAfterSeconds } = checkRateLimit("fresh-key", 1);
    expect(allowed).toBe(false);
    expect(retryAfterSeconds).toBeGreaterThan(0);
  });
});

describe("map growth", () => {
  it("reclaims a key once its window has rolled off", () => {
    vi.useFakeTimers();

    checkRateLimit("transient", 1);
    expect(rateLimitSize()).toBe(1);

    vi.advanceTimersByTime(61_000);
    checkRateLimit("other", 1);

    // "transient" is gone rather than lingering as an empty window.
    expect(rateLimitSize()).toBe(1);
  });

  it("stays bounded when a caller cycles through distinct keys", () => {
    vi.useFakeTimers();

    // Well past the 10,000-key cap, spread over time so entries expire as it
    // goes — the pattern an attacker rotating a header would produce.
    for (let i = 0; i < 12_000; i++) {
      checkRateLimit(`rotating-${i}`, 1);
      if (i % 1000 === 0) vi.advanceTimersByTime(61_000);
    }

    expect(rateLimitSize()).toBeLessThanOrEqual(10_000);
  });
});
