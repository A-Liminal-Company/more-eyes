/**
 * Where the diff under review comes from, and how much of it gets reviewed.
 *
 * Pure and fixture-testable, like diff.ts. The default is the pull request's own
 * diff. `diff_path` switches to a unified diff file the workflow produced itself —
 * the release-vetting case, where a version-bump PR's own diff (one line in a pin
 * file) says nothing about what changed upstream, so the workflow generates the
 * upstream diff between the two versions and hands it over as a file.
 */

export type DiffSource =
  | { kind: "file"; path: string }
  | { kind: "pr" }
  | { kind: "skip"; reason: string };

export function resolveDiffSource(opts: {
  diffPath: string;
  eventName: string;
  hasPullRequest: boolean;
}): DiffSource {
  const diffPath = opts.diffPath.trim();
  if (diffPath) return { kind: "file", path: diffPath };
  if (opts.eventName !== "pull_request" || !opts.hasPullRequest) {
    return { kind: "skip", reason: `event "${opts.eventName}" is not a pull_request` };
  }
  return { kind: "pr" };
}

/**
 * Caps the number of batches reviewed. 0 (or less) means no cap, which is the
 * default and keeps existing behaviour. An upstream release can be far larger than
 * a pull request, and each batch costs one call per model, so release vetting sets
 * a cap — and the caller must report what was dropped, never drop it silently.
 */
export function capBatches<T>(
  batches: T[],
  maxBatches: number
): { kept: T[]; dropped: number } {
  if (!Number.isFinite(maxBatches) || maxBatches <= 0 || batches.length <= maxBatches) {
    return { kept: batches, dropped: 0 };
  }
  return { kept: batches.slice(0, maxBatches), dropped: batches.length - maxBatches };
}
