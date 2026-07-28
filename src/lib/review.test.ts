import { afterEach, describe, expect, it, vi } from "vitest";
import { ReviewError, reviewCode } from "./review";

describe("reviewCode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws a ReviewError when ANTHROPIC_API_KEY is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    await expect(
      reviewCode({
        title: "t",
        description: "d",
        language: "typescript",
        code: "const x = 1;",
      })
    ).rejects.toBeInstanceOf(ReviewError);
  });
});
