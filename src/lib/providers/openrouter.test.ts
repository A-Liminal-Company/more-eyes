import { beforeEach, describe, expect, it, vi } from "vitest";

const create = vi.fn();
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create } };
  },
}));

import { reviewWithOpenRouter } from "./openrouter";
import { MAX_OUTPUT_TOKENS, REASONING_TOKEN_BUDGET } from "./shared";

const input = { title: "t", description: "d", language: "ts", code: "x" };

describe("reviewWithOpenRouter", () => {
  beforeEach(() => {
    create.mockReset();
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  it("caps hidden thinking below the output budget", async () => {
    create.mockResolvedValue({ choices: [{ finish_reason: "length", message: {} }] });
    await expect(reviewWithOpenRouter("google/gemini-3.5-flash", input)).rejects.toThrow();

    const params = create.mock.calls[0][0];
    expect(params.max_tokens).toBe(MAX_OUTPUT_TOKENS);
    expect(params.reasoning).toEqual({ max_tokens: REASONING_TOKEN_BUDGET });
    // Room left for the tool call itself, or the cap does nothing.
    expect(REASONING_TOKEN_BUDGET).toBeLessThanOrEqual(MAX_OUTPUT_TOKENS / 2);
  });

  it("says the budget ran out when the model stops on length", async () => {
    create.mockResolvedValue({ choices: [{ finish_reason: "length", message: {} }] });
    await expect(reviewWithOpenRouter("google/gemini-3.5-flash", input)).rejects.toThrow(
      "google/gemini-3.5-flash ran out of output tokens before returning a review."
    );
  });

  it("keeps the old message when the model just skips the tool", async () => {
    create.mockResolvedValue({
      choices: [{ finish_reason: "stop", message: { content: "no" } }],
    });
    await expect(reviewWithOpenRouter("openai/gpt-5.5", input)).rejects.toThrow(
      "openai/gpt-5.5 did not return a structured review."
    );
  });
});
