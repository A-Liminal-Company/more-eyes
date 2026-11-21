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

  const emptyReview = {
    choices: [
      {
        finish_reason: "stop",
        message: {
          tool_calls: [
            { type: "function", function: { name: "x", arguments: "{}" } },
          ],
        },
      },
    ],
  };
  const goodReview = {
    choices: [
      {
        finish_reason: "stop",
        message: {
          tool_calls: [
            {
              type: "function",
              function: { name: "x", arguments: JSON.stringify({ summary: "ok", findings: [] }) },
            },
          ],
        },
      },
    ],
  };

  it("uses the 8192-token output budget", async () => {
    create.mockResolvedValue(goodReview);
    await reviewWithOpenRouter("anthropic/claude-sonnet-5", input);
    expect(MAX_OUTPUT_TOKENS).toBe(8192);
    expect(create.mock.calls[0][0].max_tokens).toBe(8192);
  });

  it("retries once when the model returns an empty review", async () => {
    create.mockResolvedValueOnce(emptyReview).mockResolvedValueOnce(goodReview);
    const result = await reviewWithOpenRouter("anthropic/claude-sonnet-5", input);
    expect(result.summary).toBe("ok");
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("retries once when the model skips the tool, then gives up", async () => {
    create.mockResolvedValue({
      choices: [{ finish_reason: "stop", message: { content: "no" } }],
    });
    await expect(reviewWithOpenRouter("openai/gpt-5.5", input)).rejects.toThrow(
      "did not return a structured review"
    );
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("does not retry when the output budget ran out", async () => {
    create.mockResolvedValue({ choices: [{ finish_reason: "length", message: {} }] });
    await expect(reviewWithOpenRouter("google/gemini-3.5-flash", input)).rejects.toThrow(
      "ran out of output tokens"
    );
    expect(create).toHaveBeenCalledTimes(1);
  });
});
