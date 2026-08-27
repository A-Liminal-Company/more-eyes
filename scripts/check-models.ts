/**
 * Verifies the reviewer registry against OpenRouter's live catalogue.
 *
 * Catches the ways an entry goes stale without waiting for a user to hit it:
 * a slug that no longer exists, a model that has lost tool-calling support, and
 * — the reason this runs in CI rather than on demand — a model that has picked
 * up a provider outside the jurisdiction allowlist.
 *
 * That last one cannot be caught by reading `models.ts`. OpenRouter maps a slug
 * to a changing set of providers, so a roster that was clean when it was written
 * can start routing code somewhere new without a single line changing here.
 * Requests pin `provider.only` so such a provider never actually receives code
 * (see src/lib/provider-policy.ts); this check is what makes that pin visible
 * instead of silently narrowing which providers can serve a model.
 *
 * Also warns about single-provider models — those return a hard 404 with no
 * fallback if an account's data policy excludes that one provider, which is
 * exactly how qwen3-coder-plus broke.
 *
 * Run with: npm run check:models
 * Needs no API key — both endpoints are public.
 */
import { MODELS } from "../src/lib/models";
import {
  ALLOWED_PROVIDERS,
  SECONDARY_JURISDICTION_SIGNAL,
} from "../src/lib/provider-policy";

type CatalogueModel = { id: string; supported_parameters?: string[] };
type Endpoint = { provider_name?: string; tag?: string };
type ProviderInfo = {
  slug: string;
  name: string;
  headquarters?: string;
  datacenters?: string[];
};

const ALLOWED = new Set<string>(ALLOWED_PROVIDERS);
const FLAGGED_REGIONS = new Set<string>(SECONDARY_JURISDICTION_SIGNAL);

/** Provider slug for an endpoint. Tags are "<slug>" or "<slug>/<variant>". */
function slugOf(endpoint: Endpoint): string {
  return (endpoint.tag ?? "").split("/")[0];
}

async function main() {
  const res = await fetch("https://openrouter.ai/api/v1/models");
  if (!res.ok) {
    console.error(`Could not fetch catalogue: HTTP ${res.status}`);
    process.exit(1);
  }

  const catalogue: CatalogueModel[] = (await res.json()).data ?? [];
  const byId = new Map(catalogue.map((m) => [m.id, m]));

  // Provider directory, for reporting *why* a slug is out of policy — the
  // allowlist is the enforcement, this is the explanation attached to it.
  const providers = new Map<string, ProviderInfo>(
    await fetch("https://openrouter.ai/api/v1/providers")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.data ?? []).map((p: ProviderInfo) => [p.slug, p]))
      .catch(() => [])
  );

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

    const endpoints: Endpoint[] = await fetch(
      `https://openrouter.ai/api/v1/models/${model.providerModel}/endpoints`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.data?.endpoints ?? [])
      .catch(() => []);

    const slugs = [...new Set(endpoints.map(slugOf).filter(Boolean))];
    const servable = slugs.filter((s) => ALLOWED.has(s));
    const other = slugs.filter((s) => !ALLOWED.has(s));

    const describe = (slug: string): string => {
      const info = providers.get(slug);
      if (!info) return `${slug} (unknown provider)`;
      const dcs = info.datacenters ?? [];
      return `${slug} (hq=${info.headquarters ?? "?"}${
        dcs.length ? `, dc=${dcs.join("/")}` : ""
      })`;
    };

    const inFlaggedRegion = (slug: string): boolean => {
      const info = providers.get(slug);
      if (!info) return false;
      return (
        FLAGGED_REGIONS.has(info.headquarters ?? "") ||
        (info.datacenters ?? []).some((d) => FLAGGED_REGIONS.has(d))
      );
    };

    // Unroutable: the pin would leave the request nowhere to go, so every
    // review from this model fails at runtime. The one unambiguous failure.
    if (servable.length === 0) {
      console.error(
        `FAIL   ${model.id} — no allowlisted provider serves this slug; provider.only leaves it unroutable`
      );
      failures++;
      continue;
    }

    // A non-allowlisted provider in a flagged region still never receives code
    // — provider.only sees to that — but it is worth a person's attention
    // rather than a line of scrollback, because it means the model's serving
    // set now reaches somewhere the policy exists to avoid.
    const flagged = other.filter(inFlaggedRegion);
    if (flagged.length > 0) {
      console.error(
        `FAIL   ${model.id} — a provider in a flagged region now serves this slug: ${flagged
          .map(describe)
          .join(", ")}. Pinning blocks it, but decide whether to keep the model.`
      );
      failures++;
      continue;
    }

    // Everything else non-allowlisted is informational. This used to fail, and
    // that was right while the allowlist was entirely first-party: any unknown
    // provider meant the pin had silently started doing real work. Partial
    // coverage is now the normal case — DeepInfra is admitted for Inkling while
    // Together and Baseten serving the same slug are not — so failing here
    // would report the policy working as designed.
    if (other.length > 0) {
      console.warn(
        `WARN   ${model.id} — ${servable.length} allowlisted (${servable.join(
          ", "
        )}); not used: ${other.map(describe).join(", ")}`
      );
      warnings++;
      continue;
    }

    if (servable.length === 1) {
      console.warn(
        `WARN   ${model.id} — single allowlisted provider (${servable[0]}); an outage leaves no fallback`
      );
      warnings++;
    } else {
      console.log(
        `ok     ${model.id} — ${servable.length} allowlisted providers (${servable.join(", ")})`
      );
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
