export type Provider = "anthropic" | "openrouter";

export type ModelOption = {
  /** Stable id stored on the Review row and sent from the client. */
  id: string;
  label: string;
  lab: string;
  provider: Provider;
  /** The model string the provider's API expects. */
  providerModel: string;
};

/**
 * Curated shortlist. Every entry was verified against OpenRouter's catalogue as
 * supporting tool calling, which the structured-review contract depends on.
 * Deliberately spans different labs — models share blind spots with their own
 * family, so diversity is what makes a second opinion worth paying for.
 *
 * Diversity stops where corporate control does. Submitted code is unreleased
 * work and a review ships it verbatim to whoever serves the model, so every
 * entry must be servable by a provider in `provider-policy.ts` — a lab serving
 * its own model, or a first-party hyperscaler cloud. DeepSeek V3.1 and Qwen3
 * Coder were removed for that reason: `qwen/qwen3-coder` was served by Alibaba
 * Cloud, and the objection is that Alibaba is a Chinese company whose terms and
 * legal obligations put the code beyond its owner's reach — not that a rack
 * happens to sit in a particular country.
 *
 * Losing DeepSeek and Qwen cost two labs on an app whose whole premise is
 * cross-lab disagreement. Mistral Large 3 restores one from a French lab
 * serving its own model. That is the trade being made knowingly.
 *
 * To add one: confirm it reports `tools` support at
 * https://openrouter.ai/api/v1/models, then run `npm run check:models`, which
 * fails if any provider serving the slug falls outside the allowlist.
 */
export const MODELS: ModelOption[] = [
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    lab: "Anthropic",
    // Routed via OpenRouter so a single key covers every reviewer. Switch to
    // provider "anthropic" with providerModel "claude-sonnet-5" to call the
    // Anthropic API directly instead — that path is still supported and avoids
    // OpenRouter's markup, but needs ANTHROPIC_API_KEY set.
    provider: "openrouter",
    providerModel: "anthropic/claude-sonnet-5",
  },
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    lab: "OpenAI",
    provider: "openrouter",
    providerModel: "openai/gpt-5.5",
  },
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    lab: "Google",
    provider: "openrouter",
    providerModel: "google/gemini-3.5-flash",
  },
  {
    id: "grok-4.5",
    label: "Grok 4.5",
    lab: "xAI",
    provider: "openrouter",
    providerModel: "x-ai/grok-4.5",
  },
  {
    id: "mistral-large-3",
    label: "Mistral Large 3",
    lab: "Mistral",
    provider: "openrouter",
    // Served only by `mistral` itself — a French lab serving its own model, so
    // the counterparty is the lab and the jurisdiction is the EU. Single
    // provider means no fallback if Mistral is degraded; check:models warns
    // about this rather than failing, same as Grok.
    //
    // Chosen over devstral-2512 and codestral-2508 despite both being
    // code-specialised: those are tuned for writing and completing code, and
    // reviewing it is a reasoning task rather than an editing one. Large 3 is
    // also the cheapest of the three on input tokens, which is the side that
    // dominates here — submissions are long, findings are short.
    providerModel: "mistralai/mistral-large-2512",
  },
];

export const DEFAULT_MODEL_IDS = ["claude-sonnet-5"];

/** Every rostered model. Derived so trimming the roster cannot leave it stale. */
export const MAX_MODELS_PER_SUBMISSION = MODELS.length;

const BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): ModelOption | undefined {
  return BY_ID.get(id);
}

export function modelLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}
