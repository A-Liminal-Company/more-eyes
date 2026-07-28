const WINDOW_MS = 60_000;

/**
 * Budget is counted in model calls, not submissions.
 *
 * One submission bills every model it selects, so a per-submission limit lets
 * six-model requests cost six times more than one-model requests for the same
 * quota. Charging per call makes the ceiling mean the same thing either way.
 */
const MAX_CALLS_PER_WINDOW = 30;

type Charge = { at: number; cost: number };

const hits = new Map<string, Charge[]>();

export function checkRateLimit(
  key: string,
  cost = 1
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((c) => now - c.at < WINDOW_MS);
  const spent = recent.reduce((total, c) => total + c.cost, 0);

  if (spent + cost > MAX_CALLS_PER_WINDOW) {
    // Wait until enough of the window has rolled off to afford this request.
    let freed = 0;
    let retryAfterSeconds = Math.ceil(WINDOW_MS / 1000);

    for (const charge of recent) {
      freed += charge.cost;
      if (spent - freed + cost <= MAX_CALLS_PER_WINDOW) {
        retryAfterSeconds = Math.max(
          1,
          Math.ceil((WINDOW_MS - (now - charge.at)) / 1000)
        );
        break;
      }
    }

    hits.set(key, recent);
    return { allowed: false, retryAfterSeconds };
  }

  recent.push({ at: now, cost });
  hits.set(key, recent);
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimit() {
  hits.clear();
}
