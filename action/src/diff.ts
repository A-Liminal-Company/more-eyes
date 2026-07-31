/**
 * Pure, fixture-testable helpers for turning a raw unified diff (as fetched
 * from the GitHub API with `Accept: application/vnd.github.v3.diff`) into
 * batches of text the review pipeline can send to a model.
 *
 * No network, no @actions/* imports — kept thin and unit-testable per the
 * design doc's testing section.
 */

export type DiffFile = {
  /** Repo-relative path, from the new side of the diff. */
  path: string;
  /** Everything from the first `@@` hunk header to the end of this file's diff. */
  hunkText: string;
};

/** Mirrors the design doc's stated default excludes: lockfiles, generated/vendored code. */
export const DEFAULT_EXCLUDE_GLOBS = [
  "package-lock.json",
  "*.lock",
  "dist/**",
  "*.min.*",
  "vendor/**",
  "vendored/**",
  "node_modules/**",
];

function stripDiffPathPrefix(raw: string): string {
  // "+++ b/path/to/file.ts" (git sometimes trails a tab + timestamp).
  const path = raw.split("\t")[0].trim();
  return path.startsWith("b/") || path.startsWith("a/") ? path.slice(2) : path;
}

/**
 * Splits a unified diff on `diff --git` headers and extracts, per file, the
 * new-side path and the hunk text. Deletions (new side is /dev/null) and
 * hunk-less entries (pure renames, mode-only changes, binary files) are
 * dropped — there is nothing left to review.
 */
export function parseDiffFiles(rawDiff: string): DiffFile[] {
  if (!rawDiff || !rawDiff.trim()) return [];

  const lines = rawDiff.split("\n");
  const segments: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) segments.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) segments.push(current);

  const files: DiffFile[] = [];

  for (const segment of segments) {
    let newPath: string | null = null;
    let hunkStart = -1;

    for (let i = 0; i < segment.length; i++) {
      const line = segment[i];
      if (line.startsWith("+++ ")) {
        newPath = line.slice(4);
      } else if (line.startsWith("@@ ")) {
        hunkStart = i;
        break;
      }
    }

    // No hunk header: pure rename, mode-only change, or binary diff. Nothing
    // to review.
    if (hunkStart === -1) continue;
    if (!newPath) continue;

    const strippedPath = stripDiffPathPrefix(newPath);
    if (strippedPath === "/dev/null") continue; // deletion

    const hunkText = segment.slice(hunkStart).join("\n").trim();
    if (!hunkText) continue;

    files.push({ path: strippedPath, hunkText });
  }

  return files;
}

/**
 * Minimal glob-to-regex translator: supports `*` (any run of non-slash
 * chars), `**` (any run of chars, including slashes), and `?` (one
 * non-slash char). No new runtime dependency — the vocabulary the design
 * doc's default excludes need is small.
 */
function globToRegExp(glob: string): RegExp {
  let pattern = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        pattern += ".*";
        i++;
      } else {
        pattern += "[^/]*";
      }
    } else if (c === "?") {
      pattern += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      pattern += `\\${c}`;
    } else {
      pattern += c;
    }
  }
  return new RegExp(`^${pattern}$`);
}

/**
 * A pattern without a slash matches the basename at any depth (gitignore-
 * style — `*.lock` should catch `yarn.lock` wherever it lives). A pattern
 * with a slash is anchored to the full repo-relative path.
 */
function matchesGlob(path: string, glob: string): boolean {
  if (glob.includes("/")) {
    return globToRegExp(glob).test(path);
  }
  const basename = path.split("/").pop() ?? path;
  return globToRegExp(glob).test(basename);
}

/**
 * `include` (when non-empty) narrows to files matching at least one pattern;
 * `exclude` always wins over `include` for a file matching both.
 */
export function filterFiles(
  files: DiffFile[],
  include: string[],
  exclude: string[]
): DiffFile[] {
  return files.filter((file) => {
    if (exclude.some((glob) => matchesGlob(file.path, glob))) return false;
    if (include.length > 0 && !include.some((glob) => matchesGlob(file.path, glob))) {
      return false;
    }
    return true;
  });
}

function renderFile(file: DiffFile): string {
  // A synthetic diff header so the model can read the file path directly
  // from the text, matching the SYSTEM_PROMPT's instruction to set `file`
  // from "the diff header" on multi-file diff submissions.
  return `diff --git a/${file.path} b/${file.path}\n${file.hunkText}`;
}

/**
 * Greedy bin packing: files are appended to the current batch until adding
 * the next one would exceed `maxChars`, at which point a new batch starts.
 * A batch never splits a file. A single file whose rendered text alone
 * exceeds `maxChars` becomes its own batch, truncated at `maxChars` with a
 * trailing `[truncated]` marker.
 */
export function chunkFiles(files: DiffFile[], maxChars: number): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentLen = 0;

  const flush = () => {
    if (current.length > 0) {
      batches.push(current);
      current = [];
      currentLen = 0;
    }
  };

  for (const file of files) {
    const rendered = renderFile(file);

    if (rendered.length > maxChars) {
      flush();
      batches.push([`${rendered.slice(0, maxChars)}\n[truncated]`]);
      continue;
    }

    if (current.length > 0 && currentLen + rendered.length > maxChars) {
      flush();
    }

    current.push(rendered);
    currentLen += rendered.length;
  }

  flush();

  return batches;
}
