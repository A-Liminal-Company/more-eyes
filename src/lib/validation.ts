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
  format: z.enum(["code", "diff"]).default("code"),
  models: z
    .array(z.enum(MODEL_IDS))
    .min(1, "Select at least one model")
    .max(
      MAX_MODELS_PER_SUBMISSION,
      `Select at most ${MAX_MODELS_PER_SUBMISSION} models`
    )
    // Duplicates would bill twice for the same opinion and break consensus counts.
    .transform((ids) => [...new Set(ids)]),
  // Links a resubmission back to what it's re-reviewing. A missing/deleted
  // predecessor is not an error here — see the route, which verifies existence
  // and persists null rather than rejecting the submission.
  previousSubmissionId: z.string().trim().min(1).max(64).optional(),
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
  // Models return null, omit it, or occasionally send garbage here; anything
  // unusable degrades to "no assumption" rather than discarding the finding.
  assumption: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined)),
  // Same leniency as `assumption` — evidence for the finding, not a required field.
  rationale: z
    .unknown()
    .optional()
    .transform((v) => (typeof v === "string" && v.trim() ? v.trim() : undefined)),
});

// The transform gives `assumption`/`rationale` an output type of
// `string | undefined` but leaves the keys required, which would force every
// hand-built Finding literal (tests, fixtures) to write `assumption: undefined`.
// Re-declare them optional — `undefined` is assignable either way, so parsed
// values still fit.
export type Finding = Omit<
  z.infer<typeof findingSchema>,
  "assumption" | "rationale"
> & {
  /** Present only when the model stated a dependency on context the snippet cannot show. */
  assumption?: string;
  /** One sentence of concrete evidence the model cited for the finding. */
  rationale?: string;
};

/**
 * Models sometimes return a nested structure JSON-encoded as a string rather
 * than as the array the schema asks for — `"findings": "[{...}]"`. Observed from
 * two different models on the same input, and more common on larger inputs.
 * Unwrap one level before validating.
 */
function coerceArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Not JSON — fall through and treat as no findings.
    }
  }
  return [];
}

/**
 * Deliberately lenient about what a model returns.
 *
 * A tool schema is a strong hint, not a contract. Observed in practice, all with
 * `finish_reason: "tool_calls"` and no truncation:
 *   - `summary` omitted entirely despite being required
 *   - `findings` returned as a JSON-encoded string instead of an array
 *   - individual findings with severities outside the enum
 *
 * Each of these would discard an otherwise-good review under a strict parse, so
 * every field degrades independently. Callers should treat a result with no
 * summary AND no findings as a failure — see `isUsableReview`.
 */
export const reviewResultSchema = z
  .object({
    summary: z.unknown().optional(),
    findings: z.unknown().optional(),
  })
  .transform(({ summary, findings }) => ({
    summary: typeof summary === "string" ? summary : "",
    findings: coerceArray(findings)
      .map((f) => findingSchema.safeParse(f))
      .filter((r) => r.success)
      .map((r) => r.data),
  }));

export type ReviewResult = z.infer<typeof reviewResultSchema>;

/** A response with neither a summary nor a single usable finding is not a review. */
export function isUsableReview(result: ReviewResult): boolean {
  return result.summary.trim().length > 0 || result.findings.length > 0;
}
