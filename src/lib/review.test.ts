import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewError } from "./errors";
import { reviewWithAnthropic } from "./providers/anthropic";
import { reviewCode, reviewWithModels } from "./review";

const input = {
  title: "t",
  description: "d",
  language: "typescript",
  code: "const x = 1;",
};

// Both keys are blanked for every test so a real key in .env can never cause
// the suite to make a billed network call.
beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("OPENROUTER_API_KEY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reviewCode", () => {
  it("throws a ReviewError when the OpenRouter key is missing", async () => {
    await expect(reviewCode("gpt-5.5", input)).rejects.toBeInstanceOf(
      ReviewError
    );
  });

  it("routes the Claude entry without needing an Anthropic key", async () => {
    // claude-sonnet-5 is served via OpenRouter, so a missing Anthropic key must
    // not be what stops it — the error should name OpenRouter.
    await expect(reviewCode("claude-sonnet-5", input)).rejects.toThrow(
      /OPENROUTER_API_KEY/
    );
  });

  it("rejects an unknown model id", async () => {
    await expect(reviewCode("not-a-model", input)).rejects.toBeInstanceOf(
      ReviewError
    );
  });
});

describe("reviewWithAnthropic", () => {
  it("still supports the direct Anthropic path", async () => {
    // Kept working so the registry can be pointed back at the direct API.
    await expect(
      reviewWithAnthropic("claude-sonnet-5", input)
    ).rejects.toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("reviewWithModels", () => {
  it("reports each failing model instead of rejecting", async () => {
    const results = await reviewWithModels(
      ["claude-sonnet-5", "gpt-5.5"],
      input
    );

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "failed")).toBe(true);
    expect(results[0].modelId).toBe("claude-sonnet-5");
  });

  it("returns one entry per requested model, in order", async () => {
    const results = await reviewWithModels(
      ["claude-sonnet-5", "gpt-5.5", "grok-4.5"],
      input
    );

    expect(results.map((r) => r.modelId)).toEqual([
      "claude-sonnet-5",
      "gpt-5.5",
      "grok-4.5",
    ]);
  });
});
