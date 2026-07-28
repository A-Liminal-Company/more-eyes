import { z } from "zod";

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

export const reviewResultSchema = z.object({
  summary: z.string(),
  findings: z.array(findingSchema),
});

export type ReviewResult = z.infer<typeof reviewResultSchema>;
