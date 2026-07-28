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
    provider: "anthropic",
    providerModel: "claude-sonnet-5",
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
    id: "qwen3-coder-plus",
    label: "Qwen3 Coder Plus",
    lab: "Qwen",
    provider: "openrouter",
    providerModel: "qwen/qwen3-coder-plus",
  },
];

export const DEFAULT_MODEL_IDS = ["claude-sonnet-5"];

export const MAX_MODELS_PER_SUBMISSION = 6;

const BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): ModelOption | undefined {
  return BY_ID.get(id);
}

export function modelLabel(id: string): string {
  return BY_ID.get(id)?.label ?? id;
}
