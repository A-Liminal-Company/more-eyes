import OpenAI from "openai";
import { ReviewError } from "../errors";
import { reviewResultSchema, type ReviewResult } from "../validation";
import {
  REVIEW_TOOL_NAME,
  REVIEW_TOOL_SCHEMA,
  SYSTEM_PROMPT,
  buildUserPrompt,
  type ReviewInput,
} from "./shared";

export async function reviewWithOpenRouter(
  providerModel: string,
  input: ReviewInput
): Promise<ReviewResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new ReviewError("OPENROUTER_API_KEY is not configured on the server.");
  }

  const client = new OpenAI({
    apiKey,
    baseURL: "https://openrouter.ai/api/v1",
  });

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: providerModel,
      max_tokens: 4096,
      tools: [
        {
          type: "function",
          function: {
            name: REVIEW_TOOL_NAME,
            description: "Submit the structured code review findings.",
            parameters: REVIEW_TOOL_SCHEMA,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: REVIEW_TOOL_NAME },
      },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(input) },
      ],
    });
  } catch (err) {
    console.error(`[review] OpenRouter request failed (${providerModel}):`, err);
    throw new ReviewError(
      `OpenRouter request failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
  if (!toolCall || !("function" in toolCall)) {
    throw new ReviewError(
      `${providerModel} did not return a structured review.`
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(toolCall.function.arguments);
  } catch {
    throw new ReviewError(`${providerModel} returned unparseable tool arguments.`);
  }

  const parsed = reviewResultSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ReviewError(
      `${providerModel} returned an unexpected review shape: ${parsed.error.message}`
    );
  }

  return parsed.data;
}
