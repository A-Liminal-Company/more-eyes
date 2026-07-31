import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Access cookies carry a *derived* token, never `APP_ACCESS_SECRET` itself.
 *
 * The cookie value used to be the shared secret verbatim, so anything that
 * captured a cookie captured the master credential — logs, proxies, backups, a
 * browser profile on a shared machine. A token proves the holder presented the
 * secret at some point without carrying it.
 *
 * Format: `v1.<issuedAtMs>.<nonce>.<signature>`, signed over the first three
 * segments. The nonce makes every issued token distinct, so one leaked cookie
 * is identifiable rather than being indistinguishable from every other session.
 */
const VERSION = "v1";

/** Cookie lifetime, mirrored by the `maxAge` set on the cookie itself. */
export const TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueToken(secret: string, now = Date.now()): string {
  const payload = `${VERSION}.${now}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload, secret)}`;
}

/**
 * Constant-time string comparison.
 *
 * `crypto.timingSafeEqual` throws on length mismatch, which would itself leak
 * length, so unequal lengths short-circuit to false before it is reached — the
 * length of a base64url HMAC is fixed and public anyway.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verifies signature *and* age.
 *
 * Expiry is checked here rather than trusting the cookie's `maxAge`, because
 * `maxAge` is a request to the browser and a client that keeps sending an old
 * cookie would otherwise be honoured forever.
 */
export function verifyToken(
  token: string | undefined,
  secret: string,
  maxAgeMs = TOKEN_MAX_AGE_MS,
  now = Date.now()
): boolean {
  if (!token) return false;

  const segments = token.split(".");
  if (segments.length !== 4) return false;

  const [version, issuedAt, nonce, signature] = segments;
  if (version !== VERSION || !nonce) return false;

  const issuedAtMs = Number(issuedAt);
  if (!Number.isFinite(issuedAtMs)) return false;

  // A token dated in the future is either a clock problem or forgery; either
  // way it is not something to honour.
  if (issuedAtMs > now || now - issuedAtMs > maxAgeMs) return false;

  return safeEqual(signature, sign(`${version}.${issuedAt}.${nonce}`, secret));
}
