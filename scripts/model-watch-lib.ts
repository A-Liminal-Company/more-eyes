/**
 * Pure parts of the weekly model watch (scripts/model-watch.ts): the discovery
 * filter, the fixtures, and the report renderer. No network, no env, so all of
 * it is unit-tested.
 */
import type { CatalogueModel, Endpoint } from "./catalogue";
import { slugOf } from "./catalogue";

export type RosterEntry = { id: string; providerModel: string };

export type Candidate = {
  id: string;
  created: number;
  lab: string;
  /** Allowlisted providers that can serve it. */
  providers: string[];
  /** Providers serving it that the allowlist excludes (never used: provider.only). */
  otherProviders: string[];
};

export type FixtureName = "small" | "large";
export type RunResult = {
  ok: boolean;
  error?: string;
  findings?: number;
  ms: number;
};
export type HealthRow = {
  modelId: string;
  providerModel: string;
  runs: Record<FixtureName, RunResult>;
};

export type Report = {
  generatedAt: string;
  /** True when no API key was available; health was not run. */
  healthSkipped: boolean;
  fixtureChars: Record<FixtureName, number>;
  health: HealthRow[];
  candidates: Candidate[];
};

/**
 * Only candidates this recent count as news. Without it the same newer models
 * would reopen the issue every week and no week would ever be quiet.
 */
export const RECENT_DAYS = 14;

export function recentCandidates(report: Report, now = Date.parse(report.generatedAt)): Candidate[] {
  const cutoff = now / 1000 - RECENT_DAYS * 86_400;
  return report.candidates.filter((c) => c.created >= cutoff);
}

/** Lab prefix of a slug: "anthropic/claude-x" -> "anthropic". */
export const labOf = (id: string): string => id.split("/")[0];

/**
 * Cheap first pass over the catalogue, before spending a request per model on
 * endpoints. Keeps a model only if it:
 *  - comes from a lab already on the roster (the roster is cross-lab on purpose);
 *  - reports `tools` (the review contract forces a tool call);
 *  - is newer than the newest rostered model from the same lab;
 *  - produces text only: no image/audio output, and no `:free` / `:batch` /
 *    `:thinking`-style variant suffix, nor "-image" / "-audio" / "-tts" slugs.
 *    Variant suffixes are the same weights under different terms, and free
 *    tiers train on inputs.
 * Newest first.
 */
export function preFilter(
  catalogue: CatalogueModel[],
  roster: RosterEntry[]
): CatalogueModel[] {
  const rostered = new Set(roster.map((m) => m.providerModel));
  const byId = new Map(catalogue.map((m) => [m.id, m]));
  const newestByLab = new Map<string, number>();
  for (const m of roster) {
    const created = byId.get(m.providerModel)?.created ?? 0;
    const lab = labOf(m.providerModel);
    newestByLab.set(lab, Math.max(newestByLab.get(lab) ?? 0, created));
  }

  return catalogue
    .filter((m) => {
      const newest = newestByLab.get(labOf(m.id));
      return (
        newest !== undefined &&
        !rostered.has(m.id) &&
        !m.id.includes(":") &&
        !/-(image|audio|tts|transcribe|embedding)/.test(m.id) &&
        m.supported_parameters?.includes("tools") === true &&
        textOnlyOutput(m) &&
        (m.created ?? 0) > newest
      );
    })
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0));
}

function textOnlyOutput(m: CatalogueModel): boolean {
  const out = m.architecture?.output_modalities;
  // Older catalogue rows may omit modalities; don't exclude on absence.
  return !out || (out.includes("text") && out.length === 1);
}

/**
 * Second pass: routability. A model is a candidate only if at least one
 * allowlisted provider serves it — otherwise `provider.only` leaves it with
 * nowhere to go. Other providers serving the slug are reported, not disqualifying.
 */
export function toCandidate(
  model: CatalogueModel,
  endpoints: Endpoint[],
  allowed: ReadonlySet<string>
): Candidate | null {
  const slugs = [...new Set(endpoints.map(slugOf).filter(Boolean))];
  const providers = slugs.filter((s) => allowed.has(s));
  if (providers.length === 0) return null;
  return {
    id: model.id,
    created: model.created ?? 0,
    lab: labOf(model.id),
    providers,
    otherProviders: slugs.filter((s) => !allowed.has(s)),
  };
}

export const MAX_CANDIDATES = 10;

export function failedModels(health: HealthRow[]): HealthRow[] {
  return health.filter((h) => !h.runs.small.ok || !h.runs.large.ok);
}

/** `failures` counts models with at least one failed fixture, not runs. */
export function verdictLine(report: Report): string {
  return `MODEL_WATCH: failures=${failedModels(report.health).length} new=${recentCandidates(report).length}`;
}

/** Whether the workflow should open/update an issue. Quiet weeks stay quiet. */
export function needsAttention(report: Report): boolean {
  return failedModels(report.health).length > 0 || recentCandidates(report).length > 0;
}

/** Markdown table cell: escape backslashes first, then pipes, then flatten whitespace. */
export const cell = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

function runCell(r: RunResult): string {
  const secs = `${(r.ms / 1000).toFixed(1)}s`;
  return r.ok
    ? `ok, ${r.findings ?? 0} findings, ${secs}`
    : `FAILED: ${cell(r.error ?? "unknown error")} (${secs})`;
}

export function renderMarkdown(report: Report): string {
  const lines: string[] = [
    `# Model watch ${report.generatedAt.slice(0, 10)}`,
    "",
    `\`${verdictLine(report)}\``,
    "",
    "## Health",
    "",
  ];

  if (report.healthSkipped) {
    lines.push("Skipped: `OPENROUTER_API_KEY` is not set.");
  } else {
    lines.push(
      `Small fixture ${report.fixtureChars.small} chars, large ${report.fixtureChars.large} chars.`,
      "",
      "| Model | Small | Large |",
      "| --- | --- | --- |"
    );
    for (const h of report.health) {
      lines.push(
        `| ${h.modelId} | ${runCell(h.runs.small)} | ${runCell(h.runs.large)} |`
      );
    }
  }

  lines.push(
    "",
    "## New candidates",
    "",
    `Newer than the roster from the same labs. "New" in the verdict counts only those added in the last ${RECENT_DAYS} days.`,
    ""
  );
  if (report.candidates.length === 0) {
    lines.push("None.");
  } else {
    lines.push(
      "| Model | Added | Allowlisted providers | Other providers (unused) |",
      "| --- | --- | --- | --- |"
    );
    for (const c of report.candidates) {
      lines.push(
        `| ${cell(c.id)} | ${new Date(c.created * 1000).toISOString().slice(0, 10)} | ${cell(c.providers.join(", "))} | ${cell(c.otherProviders.join(", ")) || "-"} |`
      );
    }
    lines.push(
      "",
      "Adding one to the roster stays a human PR: read its provider terms and knowledge cutoff first (see README)."
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * Deterministic fixtures. Small: a short hand-written diff with a few planted
 * issues. Large: a unified diff built from the given files (path-sorted), cut
 * at a line boundary near `targetChars`.
 */
export const SMALL_DIFF = `diff --git a/src/cart.ts b/src/cart.ts
index 3f2a1b0..9c4d7e2 100644
--- a/src/cart.ts
+++ b/src/cart.ts
@@ -10,12 +10,22 @@ export type Item = { sku: string; price: number; qty: number };
 
 export function total(items: Item[]): number {
-  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
+  let sum = 0;
+  for (let i = 0; i <= items.length; i++) {
+    sum += items[i].price * items[i].qty;
+  }
+  return sum;
 }
 
+export function applyDiscount(amount: number, code: string): number {
+  const pct = eval("DISCOUNTS." + code);
+  return amount - amount * pct;
+}
+
 export async function loadCart(id: string): Promise<Item[]> {
-  const res = await fetch(\`/api/cart/\${id}\`);
-  return res.json();
+  const res = await fetch("/api/cart/" + id);
+  const data = await res.json();
+  return data.items;
 }
`;

export function buildLargeDiff(
  files: { path: string; content: string }[],
  targetChars: number
): string {
  let out = "";
  for (const f of [...files].sort((a, b) => a.path.localeCompare(b.path))) {
    const body = f.content.split("\n");
    const chunk =
      `diff --git a/${f.path} b/${f.path}\nnew file mode 100644\n--- /dev/null\n+++ b/${f.path}\n` +
      `@@ -0,0 +1,${body.length} @@\n` +
      body.map((l) => `+${l}`).join("\n") +
      "\n";
    if (out.length + chunk.length <= targetChars) {
      out += chunk;
      continue;
    }
    // Fill the remainder with whole lines of this file, then stop.
    const room = targetChars - out.length;
    const cut = chunk.lastIndexOf("\n", room);
    if (cut > 0) out += chunk.slice(0, cut + 1);
    break;
  }
  return out;
}
