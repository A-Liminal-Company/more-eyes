/**
 * Who is allowed to receive submitted code.
 *
 * Submitted code is unreleased work, and a review ships it verbatim to whoever
 * serves the model. The risk being managed is therefore **corporate control**:
 * which legal entity ends up holding the code, what its terms permit it to do
 * with it, and whose government can compel it to hand the code over.
 *
 * That is not the same question as where a datacenter sits, and conflating the
 * two gets both answers wrong. See ALLOWED_PROVIDERS for the primary test and
 * SECONDARY_JURISDICTION_SIGNAL for why geography is kept only as a
 * corroborating hint.
 *
 * Two mechanisms enforce this, and both are needed:
 *
 *  1. The reviewer roster in `models.ts` only lists models whose providers pass.
 *  2. Every OpenRouter request pins `provider.only` to the allowlist below, so
 *     a provider added to a slug later cannot silently start receiving code.
 *
 * Mechanism 2 is the load-bearing one. OpenRouter maps a model slug to a
 * changing set of providers, so a roster that was clean when written can start
 * routing somewhere new without a single line changing here.
 */

/**
 * OpenRouter provider slugs permitted to receive submitted code.
 *
 * **The test is corporate control, not geography.** Every entry is either the
 * lab that built the model serving it directly, or a first-party hyperscaler
 * cloud. In both cases the counterparty is a US or EU entity with enterprise
 * data terms, a contractual position on training, and a legal system that the
 * code's owner can actually reach.
 *
 * Excluded by the same test: providers under Chinese corporate control, whose
 * terms may permit training on inputs and which are subject to compulsion under
 * PRC law. Alibaba Cloud, DeepSeek, SiliconFlow and Tencent are the ones this
 * repo has actually encountered — see models.ts for what that cost.
 *
 * An allowlist rather than a blocklist, deliberately. A blocklist fails open
 * every time OpenRouter onboards a provider; this fails closed, which is the
 * right direction when being wrong means someone's unreleased source code is
 * held by an entity they did not choose.
 *
 * **This list needs a human.** There is no field in OpenRouter's directory for
 * "who ultimately controls this entity", and registration country is actively
 * misleading — several Chinese-founded providers register in SG, and at least
 * one with Hong Kong roots reports a US headquarters. Corporate control cannot
 * be screened automatically, which is exactly why the list is kept short enough
 * to re-derive by hand rather than grown to whatever passes a check.
 *
 * Intermediary GPU resellers are excluded by default — not because they are
 * Chinese, most are not, but because each adds a counterparty whose retention
 * and training terms need reading first. That is a per-provider decision to
 * make deliberately, not a gap to fill. DeepInfra is the sole admission so far
 * and carries its reasoning inline below; Together, Baseten, Novita and the
 * rest remain out.
 */
export const ALLOWED_PROVIDERS = [
  // First-party: the lab that built the model, serving it itself.
  "anthropic",
  "openai",
  "google-ai-studio",
  "xai",
  "mistral",
  // First-party hyperscaler clouds.
  "google-vertex",
  "azure",
  "amazon-bedrock",
  "claude-on-aws",
  /**
   * The one intermediary, admitted deliberately rather than by drift.
   *
   * Thinking Machines does not serve Inkling itself — no first-party endpoint
   * exists — so reaching the newest model available at all required accepting a
   * reseller. Of the three that serve it, DeepInfra is the only one whose
   * privacy policy makes an unconditional commitment about inference data: it
   * will not store, sell, or train on API inputs and outputs without explicit
   * consent. Together's equivalent is real but opt-in through an account
   * setting, and the account is OpenRouter's rather than ours. Baseten's policy
   * says nothing about model inputs at all — every mention of "inference" or
   * "train" in it is page navigation or a CCPA category list.
   *
   * Two caveats worth keeping visible. First, this list is global rather than
   * per-model, so DeepInfra is now eligible for any rostered model it happens
   * to serve — none today, but that can change without notice here. Second, we
   * are not DeepInfra's customer; OpenRouter is. Their policy describes what is
   * possible, not what is configured for our traffic, which is why
   * `data_collection: "deny"` below matters more than this reading does.
   */
  "deepinfra",
] as const;

/**
 * A corroborating geographic signal, **not** the primary test.
 *
 * Demoted deliberately. It was originally the main screen, which was a mistake
 * on two counts:
 *
 * - **It over-flags.** Data physically in China is reachable by PRC legal
 *   process regardless of who owns the server, which is precisely why the
 *   hyperscalers partition rather than extend: AWS China is operated by
 *   Sinnet/NWCD and Azure China by 21Vianet, as separate Chinese legal
 *   entities, because the US parent cannot maintain control there. Traffic to
 *   `amazon-bedrock` or `azure` never enters those partitions, so a CN region
 *   existing somewhere in the vendor's org chart says nothing about this app.
 *
 * - **It under-flags, and this is the worse failure.** Only about a quarter of
 *   providers in OpenRouter's directory publish a datacenter list at all, so
 *   "no CN datacenter listed" usually means "nothing listed". A screen that is
 *   silent on three quarters of its inputs is not a control.
 *
 * Kept because when it does fire it is worth reading: Alibaba was the provider
 * serving `qwen/qwen3-coder`, and `dc=[SG,CN]` is a useful corroboration of a
 * conclusion that corporate control had already reached on its own.
 *
 * HK and MO sit alongside CN: the concern is the data-access jurisdiction, not
 * the mainland border as such.
 */
export const SECONDARY_JURISDICTION_SIGNAL = ["CN", "HK", "MO"] as const;

/** @deprecated Use SECONDARY_JURISDICTION_SIGNAL — the name overstated its role. */
export const EXCLUDED_JURISDICTIONS = SECONDARY_JURISDICTION_SIGNAL;

/**
 * Routing constraints attached to every OpenRouter chat completion.
 *
 * `only` answers *who* may receive the code. `data_collection` answers the
 * separate question of *whether they may keep it* — a provider can be entirely
 * above suspicion on control and still retain submissions and train on them.
 * The allowlist alone does not address that, and OpenRouter's default for this
 * field is `"allow"`, so leaving it unset opts into the permissive behaviour.
 *
 * `allow_fallbacks` stays true so a request can still move between allowlisted
 * providers when one is degraded — the constraint is *which* providers may
 * serve it, not that a single one must. With `only` set, fallback cannot
 * escape the list.
 *
 * **Failure mode worth knowing:** if `deny` leaves a model with no eligible
 * provider, that model's request fails rather than silently downgrading. That
 * is the correct direction — no provider willing to commit to not storing the
 * code means the code should not be sent — and `reviewWithModels` already
 * degrades a single model failure into a recorded `status: "failed"` shown on
 * the review page, so a submission still returns whatever else succeeded.
 *
 * Not used here: OpenRouter also accepts `zdr: true`, restricting routing to
 * Zero Data Retention endpoints. It is stricter than this and currently far too
 * strict to apply globally — of the six rostered models only Grok (`xai/zdr`)
 * and Mistral Large 3 (`mistral/zdr`) publish ZDR endpoints, so enabling it
 * would fail the other four outright. Worth revisiting per-model if a
 * maximum-assurance tier is ever wanted.
 */
export const PROVIDER_ROUTING = {
  only: [...ALLOWED_PROVIDERS],
  allow_fallbacks: true,
  data_collection: "deny",
} as const;

/**
 * OpenRouter accepts a top-level `provider` object that the OpenAI SDK's types
 * do not model, since it is an OpenRouter extension. The SDK forwards unknown
 * body properties as-is, so this spreads cleanly into a params object; the cast
 * is confined here rather than repeated at each of the three call sites.
 */
export function withProviderRouting<T extends object>(params: T): T {
  return { ...params, provider: PROVIDER_ROUTING } as T;
}
