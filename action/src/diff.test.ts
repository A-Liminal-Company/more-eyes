import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_EXCLUDE_GLOBS, chunkFiles, filterFiles, parseDiffFiles } from "./diff";

// A realistic multi-file unified diff, shaped like what the GitHub API
// returns for `Accept: application/vnd.github.v3.diff` — one modified file,
// one added file, one deleted file, one renamed-and-modified file, and one
// pure rename with no content change.
const MULTI_FILE_DIFF = `diff --git a/src/index.ts b/src/index.ts
index 1111111..2222222 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 export function add(a: number, b: number) {
+  console.log("adding", a, b);
   return a + b;
 }
diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,3 @@
+export function subtract(a: number, b: number) {
+  return a - b;
+}
diff --git a/src/old-file.ts b/src/old-file.ts
deleted file mode 100644
index 4444444..0000000
--- a/src/old-file.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-export function multiply(a: number, b: number) {
-  return a * b;
-}
diff --git a/src/renamed-old.ts b/src/renamed-new.ts
similarity index 85%
rename from src/renamed-old.ts
rename to src/renamed-new.ts
index 5555555..6666666 100644
--- a/src/renamed-old.ts
+++ b/src/renamed-new.ts
@@ -1,2 +1,3 @@
 export function divide(a: number, b: number) {
+  if (b === 0) throw new Error("division by zero");
   return a / b;
 }
diff --git a/src/pure-rename.ts b/src/pure-rename-2.ts
similarity index 100%
rename from src/pure-rename.ts
rename to src/pure-rename-2.ts
`;

describe("parseDiffFiles", () => {
  it("extracts modified, added, and renamed-and-modified files", () => {
    const files = parseDiffFiles(MULTI_FILE_DIFF);
    const paths = files.map((f) => f.path);

    expect(paths).toEqual(["src/index.ts", "src/new-file.ts", "src/renamed-new.ts"]);
  });

  it("drops deleted files", () => {
    const files = parseDiffFiles(MULTI_FILE_DIFF);
    expect(files.some((f) => f.path === "src/old-file.ts")).toBe(false);
  });

  it("drops pure renames with no hunk", () => {
    const files = parseDiffFiles(MULTI_FILE_DIFF);
    expect(files.some((f) => f.path.includes("pure-rename"))).toBe(false);
  });

  it("captures hunk text starting at the @@ header", () => {
    const files = parseDiffFiles(MULTI_FILE_DIFF);
    const indexFile = files.find((f) => f.path === "src/index.ts");

    expect(indexFile?.hunkText.startsWith("@@ -1,3 +1,4 @@")).toBe(true);
    expect(indexFile?.hunkText).toContain('console.log("adding", a, b);');
    expect(indexFile?.hunkText).not.toContain("diff --git");
    expect(indexFile?.hunkText).not.toContain("index 1111111");
  });

  it("uses the new-side path for a renamed file", () => {
    const files = parseDiffFiles(MULTI_FILE_DIFF);
    const renamed = files.find((f) => f.path === "src/renamed-new.ts");

    expect(renamed).toBeDefined();
    expect(renamed?.hunkText).toContain("division by zero");
  });

  it("returns an empty array for an empty or blank diff", () => {
    expect(parseDiffFiles("")).toEqual([]);
    expect(parseDiffFiles("   \n  ")).toEqual([]);
  });
});

describe("filterFiles", () => {
  const files = parseDiffFiles(MULTI_FILE_DIFF);

  it("passes everything through with empty include/exclude", () => {
    expect(filterFiles(files, [], [])).toHaveLength(files.length);
  });

  it("narrows to files matching an include glob", () => {
    const filtered = filterFiles(files, ["src/index.ts"], []);
    expect(filtered.map((f) => f.path)).toEqual(["src/index.ts"]);
  });

  it("drops files matching an exclude glob", () => {
    const filtered = filterFiles(files, [], ["src/new-file.ts"]);
    expect(filtered.some((f) => f.path === "src/new-file.ts")).toBe(false);
    expect(filtered).toHaveLength(files.length - 1);
  });

  it("lets exclude win over include for a file matching both", () => {
    const filtered = filterFiles(files, ["src/**"], ["src/new-file.ts"]);
    expect(filtered.some((f) => f.path === "src/new-file.ts")).toBe(false);
  });

  it("matches a slash-less pattern against the basename at any depth", () => {
    const lockfileDiff = [
      "diff --git a/package-lock.json b/package-lock.json",
      "index aaa..bbb 100644",
      "--- a/package-lock.json",
      "+++ b/package-lock.json",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
      "",
    ].join("\n");
    const parsed = parseDiffFiles(lockfileDiff);

    expect(filterFiles(parsed, [], DEFAULT_EXCLUDE_GLOBS)).toEqual([]);
  });

  it("matches dist/** against nested generated files", () => {
    const distDiff = [
      "diff --git a/dist/bundle/app.js b/dist/bundle/app.js",
      "index aaa..bbb 100644",
      "--- a/dist/bundle/app.js",
      "+++ b/dist/bundle/app.js",
      "@@ -1,1 +1,1 @@",
      "-old",
      "+new",
      "",
    ].join("\n");
    const parsed = parseDiffFiles(distDiff);

    expect(filterFiles(parsed, [], DEFAULT_EXCLUDE_GLOBS)).toEqual([]);
  });
});

describe("chunkFiles", () => {
  const files = parseDiffFiles(MULTI_FILE_DIFF);

  it("packs everything into one batch when it fits under maxChars", () => {
    const batches = chunkFiles(files, 100_000);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(files.length);
  });

  it("never splits a single file across batches", () => {
    // Small enough that each file needs its own batch, but each rendered
    // file text still individually fits under the budget.
    const batches = chunkFiles(files, 120);

    for (const batch of batches) {
      expect(batch).toHaveLength(1);
    }
    // Every file still shows up exactly once, in some batch.
    const flat = batches.flat();
    expect(flat).toHaveLength(files.length);
  });

  it("truncates a single file that alone exceeds maxChars, in its own batch", () => {
    const hugeFile = [{ path: "src/huge.ts", hunkText: "@@ -1,1 +1,1 @@\n" + "x".repeat(500) }];
    const batches = chunkFiles(hugeFile, 100);

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0][0].length).toBeLessThanOrEqual(100 + "\n[truncated]".length);
    expect(batches[0][0].endsWith("[truncated]")).toBe(true);
  });

  it("flushes the pending batch before starting an oversized file's own batch", () => {
    const small = { path: "src/small.ts", hunkText: "@@ -1,1 +1,1 @@\nsmall" };
    const huge = { path: "src/huge.ts", hunkText: "@@ -1,1 +1,1 @@\n" + "y".repeat(500) };

    const batches = chunkFiles([small, huge], 200);

    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(1);
    expect(batches[0][0]).toContain("src/small.ts");
    expect(batches[1][0].endsWith("[truncated]")).toBe(true);
  });

  it("returns no batches for an empty file list", () => {
    expect(chunkFiles([], 1000)).toEqual([]);
  });
});

describe("filterFiles — nested build output", () => {
  const filter = (paths: string[]) =>
    filterFiles(
      paths.map((path) => ({ path, hunkText: "@@ -1 +1 @@\n+x" })),
      [],
      DEFAULT_EXCLUDE_GLOBS
    ).map((f) => f.path);

  it("excludes build output at the repo root and at any depth", () => {
    // `dist/**` is anchored to the root and does not match action/dist. This
    // repo commits a 3MB bundle there, so the anchored form alone sent it to
    // every model on every PR that touched it.
    expect(
      filter([
        "dist/a.js",
        "action/dist/index.js",
        "mcp-server/dist/src/lib/review.js",
        "node_modules/x/index.js",
        "action/node_modules/y/index.js",
      ])
    ).toEqual([]);
  });

  it("still reviews source under a directory that also holds build output", () => {
    expect(
      filter([
        "src/lib/provider-policy.ts",
        "action/src/diff.ts",
        "mcp-server/src/index.ts",
      ])
    ).toEqual([
      "src/lib/provider-policy.ts",
      "action/src/diff.ts",
      "mcp-server/src/index.ts",
    ]);
  });

  it("excludes lockfiles wherever they live, via the basename rule", () => {
    expect(filter(["package-lock.json", "action/package-lock.json"])).toEqual(
      []
    );
  });

  it("keeps action.yml's exclude default identical to DEFAULT_EXCLUDE_GLOBS", () => {
    // main.ts reads the Action input, so action.yml is what takes effect;
    // DEFAULT_EXCLUDE_GLOBS is only ever exercised by tests. Two copies of one
    // list, and the tested copy is not the live one — they had already drifted
    // in intent before this test existed.
    // Resolved from cwd rather than import.meta.url: vitest's transform does
    // not give this module a file: URL.
    const actionYml = readFileSync(
      resolve(process.cwd(), "action/action.yml"),
      "utf8"
    );
    const match = actionYml.match(/default:\s*"([^"]*dist[^"]*)"/);
    expect(match, "exclude default not found in action.yml").toBeTruthy();
    expect(match![1].split(",")).toEqual(DEFAULT_EXCLUDE_GLOBS);
  });
});
