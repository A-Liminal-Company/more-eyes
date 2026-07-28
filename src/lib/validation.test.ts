import { describe, expect, it } from "vitest";
import {
  MAX_CODE_LENGTH,
  reviewResultSchema,
  submissionInputSchema,
} from "./validation";

describe("submissionInputSchema", () => {
  it("accepts a well-formed submission", () => {
    const result = submissionInputSchema.safeParse({
      title: "Webhook handler",
      description: "Verifies and processes Stripe webhooks",
      language: "typescript",
      code: "export function handler() {}",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = submissionInputSchema.safeParse({
      title: "",
      description: "desc",
      language: "typescript",
      code: "code",
    });
    expect(result.success).toBe(false);
  });

  it("rejects code over the max length", () => {
    const result = submissionInputSchema.safeParse({
      title: "Too long",
      description: "desc",
      language: "typescript",
      code: "a".repeat(MAX_CODE_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty code body", () => {
    const result = submissionInputSchema.safeParse({
      title: "Empty",
      description: "desc",
      language: "typescript",
      code: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("reviewResultSchema", () => {
  it("accepts a valid review result", () => {
    const result = reviewResultSchema.safeParse({
      summary: "Looks solid overall.",
      findings: [
        {
          severity: "high",
          category: "security",
          title: "Missing signature verification",
          description: "The webhook handler never verifies the signature.",
          line: 12,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown severity", () => {
    const result = reviewResultSchema.safeParse({
      summary: "x",
      findings: [
        {
          severity: "critical",
          category: "security",
          title: "x",
          description: "x",
        },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty findings array", () => {
    const result = reviewResultSchema.safeParse({
      summary: "No issues found.",
      findings: [],
    });
    expect(result.success).toBe(true);
  });
});
