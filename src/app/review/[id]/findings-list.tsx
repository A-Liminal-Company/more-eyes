"use client";

import { useState } from "react";
import { isFocused, outlierSignal, type FindingGroup } from "@/lib/consensus";
import { modelLabel } from "@/lib/models";
import type { RedTeamResult } from "@/lib/redteam";
import type { Finding } from "@/lib/validation";

const SEVERITY_STYLES: Record<Finding["severity"], string> = {
  high: "bg-red-100 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-900",
  medium: "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-900",
  low: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-700",
};

/**
 * A finding group augmented with its delta status against the submission it
 * re-reviews, if any. Attached per-group (rather than as a parallel array
 * indexed like `diffGroups` returns it) so the status survives the focused/all
 * filtering in this component without index drift.
 */
export type DisplayFindingGroup = FindingGroup & {
  status?: "new" | "persistent";
  /** Verdict from the optional red-team pass. Absent when it did not run. */
  redTeam?: RedTeamResult;
};

const STATUS_STYLES: Record<"new" | "persistent", string> = {
  new: "border-emerald-600 text-emerald-800 dark:border-emerald-500 dark:text-emerald-300",
  persistent: "border-current opacity-70",
};

const STATUS_LABEL: Record<"new" | "persistent", string> = {
  new: "new since last review",
  persistent: "persistent",
};

/**
 * Demonstrability reads as a second, independent trust signal beside agreement:
 * a model built a working exploit, or tried and could not. "Not demonstrated" is
 * deliberately styled as neutral rather than as a dismissal — a model failing to
 * write an exploit is a hint, not a verdict, and some real issues are simply not
 * demonstrable from a snippet alone.
 */
const REDTEAM_STYLES: Record<"yes" | "no", string> = {
  yes: "border-red-600 text-red-800 dark:border-red-500 dark:text-red-300",
  no: "border-current opacity-70",
};

export function FindingsList({ groups }: { groups: DisplayFindingGroup[] }) {
  const [showAll, setShowAll] = useState(false);

  const focused = groups.filter(isFocused);
  const hiddenCount = groups.length - focused.length;
  // Nothing would survive the filter — showing an empty list under a "Findings
  // (5)" heading reads as a bug, so fall back to showing everything.
  const effectiveShowAll = showAll || focused.length === 0;
  const visible = effectiveShowAll ? groups : focused;

  const agreed = groups.filter((g) => g.models.length > 1).length;

  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase text-gray-500 dark:text-gray-400">
          Findings ({groups.length})
          {agreed > 0 && (
            <span className="ml-2 font-normal normal-case text-gray-500 dark:text-gray-400">
              · {agreed} flagged by more than one model
            </span>
          )}
        </h2>
        {hiddenCount > 0 && focused.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            aria-pressed={showAll}
            className="min-h-11 rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-900"
          >
            {showAll
              ? "Focused view"
              : `Show all (${hiddenCount} hidden)`}
          </button>
        )}
      </div>

      {!effectiveShowAll && hiddenCount > 0 && (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Focused view: corroborated, high-severity, and security findings.{" "}
          {hiddenCount} uncorroborated lower-severity finding
          {hiddenCount === 1 ? "" : "s"} hidden.
        </p>
      )}

      {groups.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No issues found.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((group, i) => {
            const outlier = outlierSignal(group);
            return (
              <li
                key={i}
                className={`rounded-md border px-4 py-3 ${
                  SEVERITY_STYLES[group.severity]
                }`}
              >
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    {group.severity}
                  </span>
                  <span className="text-xs uppercase tracking-wide opacity-70">
                    {group.category}
                  </span>
                  <span className="text-xs font-medium">
                    {group.models.length > 1
                      ? `${group.models.length} models agree`
                      : "1 model"}
                  </span>
                  {outlier && (
                    <span className="rounded-full border border-current px-2 py-0.5 text-xs font-medium">
                      {outlier}
                    </span>
                  )}
                  {group.status && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[group.status]}`}
                    >
                      {STATUS_LABEL[group.status]}
                    </span>
                  )}
                  {group.redTeam && (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                        REDTEAM_STYLES[group.redTeam.demonstrated ? "yes" : "no"]
                      }`}
                    >
                      {group.redTeam.demonstrated
                        ? "exploit demonstrated"
                        : "not demonstrated"}
                    </span>
                  )}
                </div>

                <p className="text-sm font-medium break-words">{group.title}</p>

                {outlier && (
                  <p className="mt-1 text-xs opacity-80">
                    Only {modelLabel(group.models[0])} flagged this. Single-model{" "}
                    {group.category === "security"
                      ? "security findings"
                      : "high-severity findings"}{" "}
                    are often a unique catch rather than noise — worth a second
                    look before dismissing.
                  </p>
                )}

                <ul className="mt-2 flex flex-col gap-2">
                  {group.findings.map((finding, j) => (
                    <li key={j} className="text-sm">
                      <span className="font-medium opacity-80">
                        {modelLabel(finding.model)}
                        {finding.file && finding.line != null
                          ? ` · ${finding.file} · line ${finding.line}`
                          : finding.file
                            ? ` · ${finding.file}`
                            : finding.line != null
                              ? ` · line ${finding.line}`
                              : null}
                      </span>
                      <span className="block opacity-90">
                        {finding.description}
                      </span>
                      {finding.assumption && (
                        <span className="mt-0.5 block text-xs italic opacity-80">
                          Assumes: {finding.assumption}
                        </span>
                      )}
                      {finding.rationale && (
                        <details className="mt-0.5 text-xs opacity-80">
                          <summary className="cursor-pointer select-none">
                            Why flag this
                          </summary>
                          <p className="mt-0.5">{finding.rationale}</p>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>

                {group.redTeam && (
                  <details className="mt-2 text-xs opacity-80">
                    <summary className="cursor-pointer select-none">
                      {group.redTeam.demonstrated
                        ? "How this is exploited"
                        : "Why this could not be demonstrated"}
                    </summary>
                    <p className="mt-1">{group.redTeam.reasoning}</p>
                    {group.redTeam.exploit && (
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded bg-black/10 p-2 dark:bg-white/10">
                        {group.redTeam.exploit}
                      </pre>
                    )}
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
