/**
 * Jurisdiction policy for where submitted code is allowed to be processed.
 *
 * Submitted code is by definition unreleased work, and a review sends it
 * verbatim to whichever provider OpenRouter picks. Choosing a model is
 * therefore not the same decision as choosing a jurisdiction: OpenRouter routes
 * a model *slug* across many independent providers, and the set of providers
 * serving a slug changes over time without the slug changing at all.
 *
 * Two things follow, and both are needed:
 *
 *  1. The reviewer roster in `models.ts` excludes Chinese-lab models.
 *  2. Every OpenRouter request pins `provider.only` to this allowlist, so a
 *     provider added to a slug later cannot silently start receiving code.
 *
 * Point 2 is the load-bearing one. Observed at the time of writing:
 * `qwen/qwen3-coder` was served by the `alibaba` provider, whose published
 * datacenter list includes `CN` — so the roster change alone fixes today while
 * the pin is what keeps it fixed.
 */

/**
 * OpenRouter provider slugs permitted to receive submitted code.
 *
 * An allowlist rather than a blocklist of Chinese providers, deliberately. A
 * blocklist silently fails open every time OpenRouter onboards a provider; this
 * fails closed, which is the correct direction when the cost of being wrong is
 * someone's unreleased source code sitting in an unintended jurisdiction.
 *
 * Every entry is US-headquartered with no CN/HK datacenter in OpenRouter's
 * published provider metadata, verified via `npm run check:models`. These are
 * exactly the providers that serve the current roster — kept tight on purpose,
 * since a wider list only helps once a model needs it.
 *
 * Note that headquarters is a weaker signal than it looks: several
 * Chinese-founded providers register in SG. `check:models` screens on
 * datacenters as well, and this list is short enough to re-derive by hand.
 */
export const ALLOWED_PROVIDERS = [
  "anthropic",
  "openai",
  "google-vertex",
  "google-ai-studio",
  "xai",
  "azure",
  "amazon-bedrock",
  "claude-on-aws",
] as const;

/**
 * ISO codes treated as out of policy, checked against both a provider's
 * headquarters and its datacenter list.
 *
 * HK and MO are included alongside CN: both are within the same national
 * security law jurisdiction for data access purposes, which is the thing being
 * excluded here rather than the mainland border as such.
 */
export const EXCLUDED_JURISDICTIONS = ["CN", "HK", "MO"] as const;

/**
 * Routing constraints attached to every OpenRouter chat completion.
 *
 * `allow_fallbacks` stays true so the request can still move between the
 * allowlisted providers when one is degraded — the constraint is *which*
 * providers may serve it, not that a single one must. With `only` set,
 * fallback cannot escape the list.
 */
export const PROVIDER_ROUTING = {
  only: [...ALLOWED_PROVIDERS],
  allow_fallbacks: true,
} as const;

/**
 * OpenRouter accepts a top-level `provider` object that the OpenAI SDK's
 * types do not model, since it is an OpenRouter extension. The SDK forwards
 * unknown body properties as-is, so this spreads cleanly into a params object;
 * the cast is confined here rather than repeated at each of the three call
 * sites.
 */
export function withProviderRouting<T extends object>(params: T): T {
  return { ...params, provider: PROVIDER_ROUTING } as T;
}
