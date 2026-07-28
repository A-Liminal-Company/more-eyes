/**
 * Verifies the reviewer registry against OpenRouter's live catalogue.
 *
 * Catches the two ways an entry goes stale without waiting for a user to hit it:
 * a slug that no longer exists, and a model that has lost tool-calling support.
 * Also warns about single-provider models — those return a hard 404 with no
 * fallback if an account's data policy excludes that one provider, which is
 * exactly how qwen3-coder-plus broke.
 *
 * Run with: npm run check:models
 * Needs no API key — the catalogue endpoint is public.
 */
import { MODELS } from "../src/lib/models";

type CatalogueModel = { id: string; supported_parameters?: string[] };

async function main() {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) {
    console.error(`Could not fetch catalogue: HTTP ${res.status}`);
    process.exit(1);
  }

  const catalogue: CatalogueModel[] = (await res.json()).data ?? [];
  const byId = new Map(catalogue.map((m) => [m.id, m]));

  let failures = 0;
  let warnings = 0;

  for (const model of MODELS) {
    if (model.provider !== "openrouter") {
      console.log(`skip   ${model.id} — direct ${model.provider} provider`);
      continue;
    }

    const entry = byId.get(model.providerModel);

    if (!entry) {
      console.error(`FAIL   ${model.id} — "${model.providerModel}" not found`);
      failures++;
      continue;
    }

    if (!entry.supported_parameters?.includes("tools")) {
      console.error(
        `FAIL   ${model.id} — "${model.providerModel}" no longer supports tools`
      );
      failures++;
      continue;
    }

    const endpoints = await fetch(
      `https://openrouter.ai/api/v1/models/${model.providerModel}/endpoints`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.data?.endpoints?.length ?? 0)
      .catch(() => 0);

    if (endpoints === 1) {
      console.warn(
        `WARN   ${model.id} — single provider; a data-policy exclusion leaves no fallback`
      );
      warnings++;
    } else {
      console.log(`ok     ${model.id} — ${endpoints} providers`);
    }
  }

  console.log(
    `\n${MODELS.length} models · ${failures} failing · ${warnings} warning`
  );
  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
