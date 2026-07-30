import { describe, expect, it } from "vitest";
import {
  MAX_CODE_LENGTH,
  isUsableReview,
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
      models: ["claude-sonnet-5"],
    });
    expect(result.success).toBe(true);
  });

  it("requires at least one model", () => {
    const result = submissionInputSchema.safeParse({
      title: "Webhook handler",
      description: "desc",
      language: "typescript",
      code: "code",
      models: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown model id", () => {
    const result = submissionInputSchema.safeParse({
      title: "Webhook handler",
      description: "desc",
      language: "typescript",
      code: "code",
      models: ["gpt-9-imaginary"],
    });
    expect(result.success).toBe(false);
  });

  it("deduplicates repeated model ids", () => {
    const result = submissionInputSchema.safeParse({
      title: "Webhook handler",
      description: "desc",
      language: "typescript",
      code: "code",
      models: ["claude-sonnet-5", "claude-sonnet-5", "gpt-5.5"],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.models).toEqual(["claude-sonnet-5", "gpt-5.5"]);
    }
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

  // Regression: Claude via OpenRouter omitted `summary` on some runs despite the
  // tool schema marking it required, with finish_reason "tool_calls" and no
  // truncation. Dropping a whole review over that loses real findings.
  it("accepts a review with no summary and keeps the findings", () => {
    const result = reviewResultSchema.safeParse({
      findings: [
        {
          severity: "high",
          category: "security",
          title: "SQL injection",
          description: "Interpolated query.",
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBe("");
      expect(result.data.findings).toHaveLength(1);
    }
  });

  // Regression: two different models returned `findings` as a JSON-encoded
  // string rather than an array, on the same input, with finish_reason
  // "tool_calls" and no truncation. A strict parse discarded both reviews.
  it("accepts findings returned as a JSON-encoded string", () => {
    const result = reviewResultSchema.safeParse({
      summary: "Stringified payload.",
      findings: JSON.stringify([
        {
          severity: "high",
          category: "security",
          title: "SQL injection",
          description: "Interpolated query.",
        },
      ]),
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.findings).toHaveLength(1);
      expect(result.data.findings[0].title).toBe("SQL injection");
    }
  });

  it("ignores a findings string that is not JSON", () => {
    const result = reviewResultSchema.safeParse({
      summary: "Prose instead of findings.",
      findings: "I could not find any issues.",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.findings).toEqual([]);
      expect(isUsableReview(result.data)).toBe(true);
    }
  });

  it("ignores a non-string summary rather than failing", () => {
    const result = reviewResultSchema.safeParse({
      summary: { text: "wrapped in an object" },
      findings: [
        {
          severity: "low",
          category: "style",
          title: "t",
          description: "d",
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.summary).toBe("");
      expect(result.data.findings).toHaveLength(1);
    }
  });

  it("drops malformed findings but keeps the valid ones", () => {
    const result = reviewResultSchema.safeParse({
      summary: "Mixed bag.",
      findings: [
        {
          severity: "high",
          category: "bug",
          title: "Real finding",
          description: "Valid.",
        },
        { severity: "catastrophic", category: "bug", title: "x" },
        "not even an object",
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.findings).toHaveLength(1);
      expect(result.data.findings[0].title).toBe("Real finding");
    }
  });

  it("treats a response with neither summary nor findings as unusable", () => {
    const result = reviewResultSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(isUsableReview(result.data)).toBe(false);
    }
  });

  it("treats findings-only and summary-only responses as usable", () => {
    const findingsOnly = reviewResultSchema.parse({
      findings: [
        {
          severity: "low",
          category: "style",
          title: "t",
          description: "d",
        },
      ],
    });
    const summaryOnly = reviewResultSchema.parse({ summary: "All clear." });

    expect(isUsableReview(findingsOnly)).toBe(true);
    expect(isUsableReview(summaryOnly)).toBe(true);
  });

  it("drops a finding with an unknown severity, keeping the review", () => {
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

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.findings).toEqual([]);
      expect(result.data.summary).toBe("x");
    }
  });

  it("accepts an empty findings array", () => {
    const result = reviewResultSchema.safeParse({
      summary: "No issues found.",
      findings: [],
    });
    expect(result.success).toBe(true);
  });
});
