import OpenAI from "openai";
import { ReviewError } from "../errors";
import { withProviderRouting } from "../provider-policy";
import {
  isUsableReview,
  reviewResultSchema,
  type ReviewResult,
} from "../validation";
import {
  MAX_OUTPUT_TOKENS,
  MAX_RETRIES,
  REASONING_TOKEN_BUDGET,
  REQUEST_TIMEOUT_MS,
  REVIEW_TOOL_NAME,
  REVIEW_TOOL_SCHEMA,
  SYSTEM_PROMPT,
  buildUserPrompt,
  withDeadline,
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
    timeout: REQUEST_TIMEOUT_MS,
    maxRetries: MAX_RETRIES,
  });

  let completion;
  try {
    completion = await withDeadline(
      client.chat.completions.create(
        withProviderRouting({
        model: providerModel,
        max_tokens: MAX_OUTPUT_TOKENS,
        // OpenRouter's unified reasoning control; models that don't think ignore it.
        reasoning: { max_tokens: REASONING_TOKEN_BUDGET },
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
        })
      ),
      providerModel
    );
  } catch (err) {
    if (err instanceof ReviewError) throw err;
    console.error(`[review] OpenRouter request failed (${providerModel}):`, err);
    throw new ReviewError(
      `OpenRouter request failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }

  const choice = completion.choices[0];
  const toolCall = choice?.message?.tool_calls?.[0];
  if (!toolCall || !("function" in toolCall)) {
    // "length" means the output budget ran out first (usually on thinking),
    // which is a budget problem, not a model that ignored the tool.
    throw new ReviewError(
      choice?.finish_reason === "length"
        ? `${providerModel} ran out of output tokens before returning a review.`
        : `${providerModel} did not return a structured review.`
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

  if (!isUsableReview(parsed.data)) {
    throw new ReviewError(`${providerModel} returned an empty review.`);
  }

  return parsed.data;
}
