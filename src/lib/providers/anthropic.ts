import Anthropic from "@anthropic-ai/sdk";
import { ReviewError } from "../errors";
import {
  isUsableReview,
  reviewResultSchema,
  type ReviewResult,
} from "../validation";
import {
  REVIEW_TOOL_NAME,
  REVIEW_TOOL_SCHEMA,
  SYSTEM_PROMPT,
  buildUserPrompt,
  type ReviewInput,
} from "./shared";

export async function reviewWithAnthropic(
  providerModel: string,
  input: ReviewInput
): Promise<ReviewResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new ReviewError("ANTHROPIC_API_KEY is not configured on the server.");
  }

  const client = new Anthropic({ apiKey });

  let message;
  try {
    message = await client.messages.create({
      model: providerModel,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: REVIEW_TOOL_NAME,
          description: "Submit the structured code review findings.",
          input_schema: REVIEW_TOOL_SCHEMA,
        },
      ],
      tool_choice: { type: "tool", name: REVIEW_TOOL_NAME },
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });
  } catch (err) {
    console.error(`[review] Anthropic request failed (${providerModel}):`, err);
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

  if (!isUsableReview(parsed.data)) {
    throw new ReviewError("Claude returned an empty review.");
  }

  return parsed.data;
}
