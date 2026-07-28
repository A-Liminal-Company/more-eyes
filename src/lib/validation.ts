import { z } from "zod";
import { MAX_MODELS_PER_SUBMISSION, MODELS } from "./models";

const MODEL_IDS = MODELS.map((m) => m.id) as [string, ...string[]];

export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_CODE_LENGTH = 20000;

export const submissionInputSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(MAX_TITLE_LENGTH),
  description: z
    .string()
    .trim()
    .min(1, "Description is required")
    .max(MAX_DESCRIPTION_LENGTH),
  language: z.string().trim().min(1, "Language is required").max(50),
  code: z
    .string()
    .min(1, "Code is required")
    .max(MAX_CODE_LENGTH, `Code must be under ${MAX_CODE_LENGTH} characters`),
  models: z
    .array(z.enum(MODEL_IDS))
    .min(1, "Select at least one model")
    .max(
      MAX_MODELS_PER_SUBMISSION,
      `Select at most ${MAX_MODELS_PER_SUBMISSION} models`
    )
    // Duplicates would bill twice for the same opinion and break consensus counts.
    .transform((ids) => [...new Set(ids)]),
});

export type SubmissionInput = z.infer<typeof submissionInputSchema>;

export const findingSchema = z.object({
  severity: z.enum(["high", "medium", "low"]),
  category: z.enum([
    "bug",
    "security",
    "reliability",
    "performance",
    "style",
  ]),
  title: z.string(),
  description: z.string(),
  line: z.number().int().positive().nullable().optional(),
});

export type Finding = z.infer<typeof findingSchema>;

/**
 * Deliberately lenient about what a model returns.
 *
 * Models do not reliably honour `required` in a tool schema — Claude via
 * OpenRouter was observed omitting `summary` on some runs and including it on
 * others, with the same input and a finish_reason of `tool_calls`. Rejecting the
 * whole response over one missing string would throw away a perfectly good set
 * of findings, so `summary` is optional and individually malformed findings are
 * dropped rather than failing the batch.
 *
 * Callers should treat a result with no summary AND no findings as a failure —
 * see `assertUsableReview`.
 */
export const reviewResultSchema = z
  .object({
    summary: z.string().optional(),
    findings: z.array(z.unknown()).optional(),
  })
  .transform(({ summary, findings }) => ({
    summary: summary ?? "",
    findings: (findings ?? [])
      .map((f) => findingSchema.safeParse(f))
      .filter((r) => r.success)
      .map((r) => r.data),
  }));

export type ReviewResult = z.infer<typeof reviewResultSchema>;

/** A response with neither a summary nor a single usable finding is not a review. */
export function isUsableReview(result: ReviewResult): boolean {
  return result.summary.trim().length > 0 || result.findings.length > 0;
}
