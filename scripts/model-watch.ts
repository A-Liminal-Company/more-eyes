/**
 * Weekly model watch.
 *
 *  1. Health: every rostered model reviews a small and a large diff through the
 *     real review path (reviewCode -> provider -> provider.only routing), so a
 *     failure like Gemini running out of output tokens on ~30k-char batches is
 *     caught before it hits a real review.
 *  2. Discovery: models from rostered labs, newer than the lab's newest
 *     rostered model, that report tools and are routable under the allowlist.
 *
 * Failures are data: the script exits 0 whenever it completes. It exits
 * non-zero only if it crashes or the OpenRouter catalogue is unreachable.
 * Without OPENROUTER_API_KEY, discovery still runs and health is skipped.
 *
 * Run with: npm run watch:models -- --json model-watch.json
 * Cost: 2 reviews x roster size per week, roughly $0.30-$1.
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MODELS } from "../src/lib/models";
import { ALLOWED_PROVIDERS } from "../src/lib/provider-policy";
import { reviewCode } from "../src/lib/review";
import type { ReviewInput } from "../src/lib/review";
import { fetchCatalogue, fetchEndpoints } from "./catalogue";
import {
  MAX_CANDIDATES,
  SMALL_DIFF,
  buildLargeDiff,
  preFilter,
  renderMarkdown,
  toCandidate,
  verdictLine,
  type Candidate,
  type FixtureName,
  type HealthRow,
  type Report,
  type RunResult,
} from "./model-watch-lib";

const LARGE_TARGET_CHARS = 29_000;

function largeDiff(): string {
  const dir = path.join(__dirname, "..", "src", "lib");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => ({
      path: `src/lib/${f}`,
      content: readFileSync(path.join(dir, f), "utf8"),
    }));
  return buildLargeDiff(files, LARGE_TARGET_CHARS);
}

function input(code: string, title: string): ReviewInput {
  return {
    title,
    description: "Model watch health check; review for real defects.",
    language: "typescript",
    code,
    format: "diff",
  };
}

async function timed(modelId: string, review: ReviewInput): Promise<RunResult> {
  const start = Date.now();
  try {
    const result = await reviewCode(modelId, review);
    return { ok: true, findings: result.findings.length, ms: Date.now() - start };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      ms: Date.now() - start,
    };
  }
}

async function health(fixtures: Record<FixtureName, ReviewInput>): Promise<HealthRow[]> {
  const rows: HealthRow[] = MODELS.map((m) => ({
    modelId: m.id,
    providerModel: m.providerModel,
    runs: {} as HealthRow["runs"],
  }));
  // One fixture at a time, all models in parallel: keeps the large batch from
  // competing with the small one for rate limits.
  for (const name of ["small", "large"] as const) {
    const results = await Promise.all(MODELS.map((m) => timed(m.id, fixtures[name])));
    results.forEach((r, i) => (rows[i].runs[name] = r));
  }
  return rows;
}

async function discover(): Promise<Candidate[]> {
  const catalogue = await fetchCatalogue();
  const allowed = new Set<string>(ALLOWED_PROVIDERS);
  const pre = preFilter(catalogue, MODELS);
  const out: Candidate[] = [];
  // Newest first, so stop as soon as the cap is reached.
  for (const model of pre) {
    if (out.length >= MAX_CANDIDATES) break;
    const c = toCandidate(model, await fetchEndpoints(model.id), allowed);
    if (c) out.push(c);
  }
  return out;
}

async function main() {
  const jsonIdx = process.argv.indexOf("--json");
  const jsonPath = jsonIdx > -1 ? process.argv[jsonIdx + 1] : undefined;

  const fixtures = {
    small: input(SMALL_DIFF, "Cart totals and discounts"),
    large: input(largeDiff(), "Large batch from src/lib"),
  };

  const candidates = await discover();
  const healthSkipped = !process.env.OPENROUTER_API_KEY;

  const report: Report = {
    generatedAt: new Date().toISOString(),
    healthSkipped,
    fixtureChars: {
      small: fixtures.small.code.length,
      large: fixtures.large.code.length,
    },
    health: healthSkipped ? [] : await health(fixtures),
    candidates,
  };

  if (jsonPath) writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
  console.log(renderMarkdown(report));
  console.log(verdictLine(report));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
