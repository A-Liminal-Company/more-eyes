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
 * Diversity stops at the jurisdiction line. Submitted code is unreleased work
 * and a review ships it verbatim to whoever serves the model, so the roster
 * excludes Chinese-lab models and every request pins routing to the allowlist
 * in `provider-policy.ts`. DeepSeek V3.1 and Qwen3 Coder were removed for this
 * reason — `qwen/qwen3-coder` was in fact served by `alibaba`, whose published
 * datacenter list includes CN. Losing two labs costs real coverage; that is the
 * trade being made knowingly, not an oversight.
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
