/**
 * Shared OpenRouter catalogue helpers for the scripts in this directory
 * (check-models.ts, model-watch.ts). All endpoints used here are public.
 */

export type CatalogueModel = {
  id: string;
  /** Unix seconds. */
  created?: number;
  supported_parameters?: string[];
  architecture?: { input_modalities?: string[]; output_modalities?: string[] };
};
export type Endpoint = { provider_name?: string; tag?: string };
export type ProviderInfo = {
  slug: string;
  name: string;
  headquarters?: string;
  datacenters?: string[];
};

const BASE = "https://openrouter.ai/api/v1";

/** Provider slug for an endpoint. Tags are "<slug>" or "<slug>/<variant>". */
export function slugOf(endpoint: Endpoint): string {
  return (endpoint.tag ?? "").split("/")[0];
}

/** Throws if the catalogue is unreachable; callers decide how loudly to fail. */
export async function fetchCatalogue(): Promise<CatalogueModel[]> {
  const res = await fetch(`${BASE}/models`);
  if (!res.ok) throw new Error(`Could not fetch catalogue: HTTP ${res.status}`);
  return (await res.json()).data ?? [];
}

/** Empty on any failure — callers treat "no endpoints" as unroutable. */
export async function fetchEndpoints(providerModel: string): Promise<Endpoint[]> {
  return fetch(`${BASE}/models/${providerModel}/endpoints`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => j?.data?.endpoints ?? [])
    .catch(() => []);
}

export async function fetchProviders(): Promise<Map<string, ProviderInfo>> {
  return new Map<string, ProviderInfo>(
    await fetch(`${BASE}/providers`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (j?.data ?? []).map((p: ProviderInfo) => [p.slug, p]))
      .catch(() => [])
  );
}
