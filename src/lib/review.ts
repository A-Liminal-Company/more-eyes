import { ReviewError } from "./errors";
import { getModel } from "./models";
import { reviewWithAnthropic } from "./providers/anthropic";
import { reviewWithOpenRouter } from "./providers/openrouter";
import type { ReviewInput } from "./providers/shared";
import type { ReviewResult } from "./validation";

export { ReviewError };
export type { ReviewInput };

export type ModelReview =
  | { modelId: string; status: "ok"; result: ReviewResult }
  | { modelId: string; status: "failed"; error: string };

export async function reviewCode(
  modelId: string,
  input: ReviewInput
): Promise<ReviewResult> {
  const model = getModel(modelId);
  if (!model) {
    throw new ReviewError(`Unknown model: ${modelId}`);
  }

  return model.provider === "anthropic"
    ? reviewWithAnthropic(model.providerModel, input)
    : reviewWithOpenRouter(model.providerModel, input);
}

/**
 * Runs every requested model in parallel and returns one entry per model.
 *
 * Never rejects: a model that fails comes back as `status: "failed"` so the
 * reviews that succeeded are still persisted and shown. With several models per
 * submission, all-or-nothing would throw away good work over one flaky provider.
 */
export async function reviewWithModels(
  modelIds: string[],
  input: ReviewInput
): Promise<ModelReview[]> {
  return Promise.all(
    modelIds.map(async (modelId): Promise<ModelReview> => {
      try {
        const result = await reviewCode(modelId, input);
        return { modelId, status: "ok", result };
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        console.error(`[review] model ${modelId} failed:`, error);
        return { modelId, status: "failed", error };
      }
    })
  );
}
