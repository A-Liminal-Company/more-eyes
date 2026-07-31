import Link from "next/link";
import { groupFindings, isConsensusAssignment } from "@/lib/consensus";
import { modelLabel } from "@/lib/models";
import { computeModelStats } from "@/lib/model-stats";
import { prisma } from "@/lib/prisma";
import { parseFindings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ModelsPage() {
  const submissions = await prisma.submission.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { reviews: true },
  });

  const stats = computeModelStats(
    submissions.map((submission) => {
      const succeeded = submission.reviews.filter((r) => r.status === "ok");
      return {
        reviews: submission.reviews,
        groups: groupFindings(
          succeeded.flatMap((review) =>
            parseFindings(review.findings).map((finding) => ({
              ...finding,
              model: review.model,
            }))
          ),
          isConsensusAssignment(submission.consensus)
            ? submission.consensus
            : null
        ),
      };
    })
  );

  return (
    <main id="main" className="mx-auto max-w-3xl w-full px-6 py-12 flex-1">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center text-sm text-gray-500 dark:text-gray-400 hover:underline"
      >
        ← All submissions
      </Link>

      <h1 className="text-2xl font-semibold mt-2 mb-1">Model quality</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
        Across the last {submissions.length} submission
        {submissions.length === 1 ? "" : "s"}: how often each model&apos;s
        findings are corroborated by at least one other model. A low rate means
        many isolated findings — check whether they are unique catches or noise
        before trimming a model from the roster.
      </p>

      {stats.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          No reviews yet. Submit code to start collecting model stats.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th scope="col" className="px-4 py-3 font-semibold">
                  Model
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">
                  Reviews
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">
                  Failures
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">
                  Findings
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">
                  Corroborated
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">
                  Rate
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {stats.map((s) => (
                <tr key={s.model}>
                  <td className="px-4 py-3 font-medium">
                    {modelLabel(s.model)}
                  </td>
                  <td className="px-4 py-3 text-right">{s.reviews}</td>
                  <td className="px-4 py-3 text-right">
                    {s.failures > 0 ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        {s.failures}
                      </span>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{s.findings}</td>
                  <td className="px-4 py-3 text-right">{s.corroborated}</td>
                  <td className="px-4 py-3 text-right">
                    {s.corroborationRate == null
                      ? "—"
                      : `${Math.round(s.corroborationRate * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
