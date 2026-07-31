import Link from "next/link";
import { notFound } from "next/navigation";
import {
  diffGroups,
  groupFindings,
  isConsensusAssignment,
  type FindingGroup,
  type ModelFinding,
} from "@/lib/consensus";
import { modelLabel } from "@/lib/models";
import { prisma } from "@/lib/prisma";
import { parseFindings } from "@/lib/types";
import { FindingsList, type DisplayFindingGroup } from "./findings-list";

export const dynamic = "force-dynamic";

/** Same groupFindings + parseFindings pipeline the current submission uses, so the two sides of a diff are comparable. */
function groupsFor(submission: {
  reviews: { status: string; model: string; findings: unknown }[];
  consensus: unknown;
}): FindingGroup[] {
  const succeeded = submission.reviews.filter((r) => r.status === "ok");
  const allFindings: ModelFinding[] = succeeded.flatMap((review) =>
    parseFindings(review.findings).map((finding) => ({
      ...finding,
      model: review.model,
    }))
  );
  return groupFindings(
    allFindings,
    isConsensusAssignment(submission.consensus) ? submission.consensus : null
  );
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: {
      reviews: { orderBy: { createdAt: "asc" } },
      previous: { include: { reviews: { orderBy: { createdAt: "asc" } } } },
    },
  });

  if (!submission) {
    notFound();
  }

  const succeeded = submission.reviews.filter((r) => r.status === "ok");
  const failed = submission.reviews.filter((r) => r.status !== "ok");

  const groups = groupsFor(submission);

  // Delta tracking against the submission this one re-reviews, if any. Matching
  // is lexical (same as groupFindings), so "new" is the safe over-reporting
  // failure mode when a finding is merely paraphrased differently — see
  // diffGroups' JSDoc in consensus.ts.
  let displayGroups: DisplayFindingGroup[] = groups;
  let fixedGroups: FindingGroup[] = [];
  if (submission.previous) {
    const previousGroups = groupsFor(submission.previous);
    const { status, fixed } = diffGroups(groups, previousGroups);
    displayGroups = groups.map((group, i) => ({ ...group, status: status[i] }));
    fixedGroups = fixed;
  }

  return (
    <main id="main" className="mx-auto max-w-3xl w-full px-6 py-12 flex-1">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm text-gray-500 dark:text-gray-400 hover:underline">
        ← All submissions
      </Link>

      <h1 className="text-2xl font-semibold mt-2 mb-1">{submission.title}</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
        {submission.format === "diff" ? "unified diff" : submission.language}{" "}
        · {new Date(submission.createdAt).toLocaleString()} ·{" "}
        {succeeded.length} of {submission.reviews.length} model
        {submission.reviews.length === 1 ? "" : "s"} responded
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 flex flex-wrap gap-x-3">
        {submission.previous && (
          <Link
            href={`/review/${submission.previous.id}`}
            className="min-h-11 inline-flex items-center hover:underline"
          >
            ← Previous review
          </Link>
        )}
        <Link
          href={`/submit?previous=${submission.id}`}
          className="min-h-11 inline-flex items-center hover:underline"
        >
          Re-review this code
        </Link>
      </p>

      {failed.length > 0 && (
        <section
          className="mb-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950"
          role="status"
        >
          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
            {failed.length} model{failed.length === 1 ? "" : "s"} failed
          </p>
          <ul className="mt-1 text-sm text-amber-900 dark:text-amber-100 break-words">
            {failed.map((review) => (
              <li key={review.id}>
                {modelLabel(review.model)}: {review.error ?? "unknown error"}
              </li>
            ))}
          </ul>
        </section>
      )}

      {succeeded.length > 0 && (
        <>
          <FindingsList groups={displayGroups} />

          {fixedGroups.length > 0 && (
            <details className="mb-8 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950">
              <summary className="cursor-pointer text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                Fixed since last review ({fixedGroups.length})
              </summary>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-emerald-900 dark:text-emerald-100">
                {fixedGroups.map((group, i) => (
                  <li key={i}>
                    <span className="font-medium break-words">{group.title}</span>
                    <span className="opacity-70">
                      {" "}
                      · {group.category} · {group.severity}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase text-gray-500 dark:text-gray-400 mb-3">
              Summaries
            </h2>
            <ul className="flex flex-col gap-3">
              {succeeded.map((review) => (
                <li
                  key={review.id}
                  className="rounded-md border border-gray-200 px-4 py-3 dark:border-gray-700"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                    {modelLabel(review.model)}
                  </p>
                  {review.summary ? (
                    <p className="text-sm leading-relaxed">{review.summary}</p>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                      No summary returned — findings only.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2">
          Code
        </h2>
        <pre className="rounded-md bg-gray-900 text-gray-100 text-xs p-4 overflow-x-auto">
          <code>{submission.code}</code>
        </pre>
      </section>
    </main>
  );
}
