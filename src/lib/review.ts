import Anthropic from "@anthropic-ai/sdk";
import { reviewResultSchema, type ReviewResult } from "./validation";

const MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5";

const REVIEW_TOOL = {
  name: "submit_review",
  description: "Submit the structured code review findings.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: {
        type: "string",
        description: "A 2-4 sentence plain-language summary of the review.",
      },
      findings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            severity: { type: "string", enum: ["high", "medium", "low"] },
            category: {
              type: "string",
              enum: ["bug", "security", "reliability", "performance", "style"],
            },
            title: { type: "string" },
            description: { type: "string" },
            line: { type: ["number", "null"] },
          },
          required: ["severity", "category", "title", "description"],
        },
      },
    },
    required: ["summary", "findings"],
  },
};

export class ReviewError extends Error {}

export async function reviewCode(input: {
  title: string;
  description: string;
  language: string;
  code: string;
}): Promise<ReviewResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ReviewError(
      "ANTHROPIC_API_KEY is not configured on the server."
    );
  }

  const client = new Anthropic({ apiKey });

  let message;
  try {
    message = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      tools: [REVIEW_TOOL],
      tool_choice: { type: "tool", name: "submit_review" },
      messages: [
        {
          role: "user",
          content: [
            "You are an experienced code reviewer. Review the following code submission",
            "for bugs, security issues, reliability problems, performance concerns, and style issues.",
            "Be specific and concrete. If the code looks correct, say so and return an empty findings array.",
            "",
            `Title: ${input.title}`,
            `What it's supposed to do: ${input.description}`,
            `Language: ${input.language}`,
            "",
            "Code:",
            "```" + input.language,
            input.code,
            "```",
          ].join("\n"),
        },
      ],
    });
  } catch (err) {
    throw new ReviewError(
      `Claude review request failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUse) {
    throw new ReviewError("Claude did not return a structured review.");
  }

  const parsed = reviewResultSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new ReviewError(
      `Claude returned an unexpected review shape: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
