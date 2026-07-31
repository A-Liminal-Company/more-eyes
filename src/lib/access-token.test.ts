import { describe, expect, it } from "vitest";
import {
  TOKEN_MAX_AGE_MS,
  issueToken,
  safeEqual,
  verifyToken,
} from "./access-token";

const SECRET = "correct-horse-battery-staple";

describe("issueToken", () => {
  it("round-trips against the secret that issued it", () => {
    expect(verifyToken(issueToken(SECRET), SECRET)).toBe(true);
  });

  it("never contains the secret", () => {
    expect(issueToken(SECRET)).not.toContain(SECRET);
  });

  it("issues a distinct token every time", () => {
    const now = 1_700_000_000_000;
    expect(issueToken(SECRET, now)).not.toBe(issueToken(SECRET, now));
  });
});

describe("verifyToken", () => {
  it("rejects a token signed with a different secret", () => {
    expect(verifyToken(issueToken("other-secret"), SECRET)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const [v, at, nonce] = issueToken(SECRET).split(".");
    expect(verifyToken(`${v}.${at}.${nonce}.forged`, SECRET)).toBe(false);
  });

  it("rejects a tampered nonce", () => {
    const [v, at, , sig] = issueToken(SECRET).split(".");
    expect(verifyToken(`${v}.${at}.deadbeef.${sig}`, SECRET)).toBe(false);
  });

  it("rejects a back-dated issue time, so expiry cannot be extended", () => {
    const now = 1_700_000_000_000;
    const [v, , nonce, sig] = issueToken(SECRET, now).split(".");
    expect(verifyToken(`${v}.${now - 1}.${nonce}.${sig}`, SECRET)).toBe(false);
  });

  it("rejects a token past its maximum age", () => {
    const issuedAt = 1_700_000_000_000;
    const token = issueToken(SECRET, issuedAt);

    expect(
      verifyToken(token, SECRET, TOKEN_MAX_AGE_MS, issuedAt + TOKEN_MAX_AGE_MS - 1)
    ).toBe(true);
    expect(
      verifyToken(token, SECRET, TOKEN_MAX_AGE_MS, issuedAt + TOKEN_MAX_AGE_MS + 1)
    ).toBe(false);
  });

  it("rejects a token dated in the future", () => {
    const now = 1_700_000_000_000;
    expect(verifyToken(issueToken(SECRET, now + 60_000), SECRET, undefined, now)).toBe(
      false
    );
  });

  it("rejects the raw secret, which is what pre-token cookies held", () => {
    expect(verifyToken(SECRET, SECRET)).toBe(false);
  });

  it("rejects malformed input without throwing", () => {
    for (const token of [undefined, "", "v1", "v1.a.b.c.d", "v2.1.a.b", "...."]) {
      expect(verifyToken(token, SECRET)).toBe(false);
    }
  });
});

describe("safeEqual", () => {
  it("matches identical strings and rejects everything else", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
