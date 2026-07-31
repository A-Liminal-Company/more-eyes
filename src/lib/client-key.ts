/**
 * How many proxies sit between the internet and this process.
 *
 * Railway terminates TLS at its edge and forwards to the container, so one hop
 * is right for the default deployment. Raise it only if you add another proxy
 * in front — setting it too high starts trusting client-supplied entries again.
 */
const TRUSTED_PROXY_HOPS = Math.max(
  1,
  Number(process.env.TRUSTED_PROXY_HOPS ?? 1)
);

/** Used when no proxy header is present, e.g. running locally. */
const LOCAL_KEY = "local";

/**
 * The rate-limit key for a request.
 *
 * `X-Forwarded-For` is *appended to* by each proxy it passes through, so the
 * rightmost entries are the ones proxies wrote and the leftmost is whatever the
 * original client claimed. Reading the leftmost entry — which this app used to
 * do — hands the rate-limit key to the caller: rotate the header, get a fresh
 * budget every request.
 *
 * Counting from the right instead means the value came from our own trusted
 * proxy. A client that sends its own `X-Forwarded-For` only prepends to the
 * list; it cannot control the entry we read.
 */
export function clientKeyFor(request: {
  headers: { get(name: string): string | null };
}): string {
  const header = request.headers.get("x-forwarded-for");
  if (!header) return LOCAL_KEY;

  const entries = header
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (entries.length === 0) return LOCAL_KEY;

  // Nth from the right. If the header is shorter than the configured hop count,
  // the request did not come through the expected chain — fall back to the
  // leftmost entry rather than reading past the end.
  const index = entries.length - TRUSTED_PROXY_HOPS;
  return entries[Math.max(0, index)];
}
