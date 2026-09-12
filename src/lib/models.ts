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
 * To add one: confirm it reports `tools` support at
 * https://openrouter.ai/api/v1/models before adding it here.
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
    id: "deepseek-v3.1",
    label: "DeepSeek V3.1",
    lab: "DeepSeek",
    provider: "openrouter",
    providerModel: "deepseek/deepseek-chat-v3.1",
  },
  {
    id: "qwen3-coder",
    label: "Qwen3 Coder",
    lab: "Qwen",
    provider: "openrouter",
    // Not the "-plus" variant: that one is served by Alibaba alone, so any
    // account data policy excluding Alibaba leaves no endpoint and OpenRouter
    // returns a hard 404. This slug has six providers to fall back through.
    providerModel: "qwen/qwen3-coder",
  },
  {
    id: "glm-5.3-flash",
    label: "GLM 5.3 Flash",
    lab: "Z.ai",
    provider: "openrouter",
    // The model that ran as the anonymous `stealth/ox-alpha` preview in August
    // 2026. That slug was retired when Z.ai claimed it and is not a working
    // alias — point at the named one. Around twenty providers serve it, so the
    // single-provider failure mode described above does not apply here.
    //
    // On trial. It is the third reviewer from a Chinese lab, alongside DeepSeek
    // and Qwen, and this registry is worth its cost only while the entries have
    // independent blind spots. A separate lineage (320B-A18B, newly trained
    // base) is a reason to expect independence, not evidence of it — the
    // corroboration rates on `/models` are what settle whether it earns a
    // standing seat. It also reasons before answering, which makes it the entry
    // most likely to hit `REVIEW_DEADLINE_MS` on a long paste, so watch its
    // failure count too.
    providerModel: "z-ai/glm-5.3-flash",
  },
];

export const DEFAULT_MODEL_IDS = ["claude-sonnet-5"];

/**
 * Deliberately one below `MODELS.length` while GLM 5.3 Flash is on trial: a
 * submission picks six of the seven, so trying the new entry means swapping it
 * for one of the incumbents and comparing, rather than quietly adding a seventh
 * bill and a seventh voice to every consensus count. Raise it to
 * `MODELS.length` once the trial resolves either way.
 */
export const MAX_MODELS_PER_SUBMISSION = 6;

const BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): ModelOption | undefined {
  return BY_ID.get(id);
}

export function modelLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}
