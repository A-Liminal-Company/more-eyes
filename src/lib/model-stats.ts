import type { FindingGroup } from "./consensus";

export type ModelStats = {
  model: string;
  /** Reviews that returned a usable result. */
  reviews: number;
  failures: number;
  findings: number;
  /** Findings that landed in a group at least one other model also flagged. */
  corroborated: number;
  /** corroborated / findings, or null when the model has no findings yet. */
  corroborationRate: number | null;
};

export type SubmissionForStats = {
  groups: FindingGroup[];
  reviews: { model: string; status: string }[];
};

/**
 * Aggregates, per model, how often its findings are corroborated by another
 * model versus standing alone. A persistently low corroboration rate is a
 * signal to look at that model's isolated findings and decide whether they are
 * unique catches or noise — the number identifies where to look, it does not
 * decide by itself.
 */
export function computeModelStats(
  submissions: SubmissionForStats[]
): ModelStats[] {
  const byModel = new Map<string, ModelStats>();

  const stats = (model: string): ModelStats => {
    let entry = byModel.get(model);
    if (!entry) {
      entry = {
        model,
        reviews: 0,
        failures: 0,
        findings: 0,
        corroborated: 0,
        corroborationRate: null,
      };
      byModel.set(model, entry);
    }
    return entry;
  };

  for (const submission of submissions) {
    for (const review of submission.reviews) {
      const entry = stats(review.model);
      if (review.status === "ok") entry.reviews++;
      else entry.failures++;
    }

    for (const group of submission.groups) {
      const corroborated = group.models.length > 1;
      for (const finding of group.findings) {
        const entry = stats(finding.model);
        entry.findings++;
        if (corroborated) entry.corroborated++;
      }
    }
  }

  for (const entry of byModel.values()) {
    entry.corroborationRate =
      entry.findings > 0 ? entry.corroborated / entry.findings : null;
  }

  return [...byModel.values()].sort((a, b) => {
    const rateA = a.corroborationRate ?? -1;
    const rateB = b.corroborationRate ?? -1;
    if (rateA !== rateB) return rateB - rateA;
    return b.findings - a.findings;
  });
}
