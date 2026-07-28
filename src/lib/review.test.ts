import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewError, reviewCode, reviewWithModels } from "./review";

const input = {
  title: "t",
  description: "d",
  language: "typescript",
  code: "const x = 1;",
};

describe("reviewCode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws a ReviewError when ANTHROPIC_API_KEY is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    await expect(reviewCode("claude-sonnet-5", input)).rejects.toBeInstanceOf(
      ReviewError
    );
  });

  it("throws a ReviewError when OPENROUTER_API_KEY is missing", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");

    await expect(reviewCode("gpt-5.5", input)).rejects.toBeInstanceOf(
      ReviewError
    );
  });

  it("rejects an unknown model id", async () => {
    await expect(reviewCode("not-a-model", input)).rejects.toBeInstanceOf(
      ReviewError
    );
  });
});

describe("reviewWithModels", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports each failing model instead of rejecting", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");

    const results = await reviewWithModels(
      ["claude-sonnet-5", "gpt-5.5"],
      input
    );

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.status === "failed")).toBe(true);
    expect(results[0].modelId).toBe("claude-sonnet-5");
  });

  it("returns one entry per requested model", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");

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
