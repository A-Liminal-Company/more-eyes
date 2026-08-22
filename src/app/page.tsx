import Link from "next/link";
import { groupFindings, isConsensusAssignment } from "@/lib/consensus";
import { prisma } from "@/lib/prisma";
import { parseFindings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const submissions = await prisma.submission.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { reviews: true },
  });

  return (
    <main id="main" className="mx-auto max-w-3xl w-full px-6 py-12 flex-1">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">More Eyes</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/models"
            className="inline-flex min-h-11 items-center text-sm text-gray-500 hover:underline dark:text-gray-400"
          >
            Model quality
          </Link>
          <Link
            href="/submit"
            className="inline-flex min-h-11 items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-white dark:text-black dark:hover:bg-gray-200"
          >
            Submit code
          </Link>
        </div>
      </div>

      {submissions.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">
          No submissions yet. Submit something to get your first review.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden dark:divide-gray-700 dark:border-gray-700">
          {submissions.map((submission) => {
            const succeeded = submission.reviews.filter(
              (r) => r.status === "ok"
            );
            const findings = groupFindings(
              succeeded.flatMap((review) =>
                parseFindings(review.findings).map((finding) => ({
                  ...finding,
                  model: review.model,
                }))
              ),
              isConsensusAssignment(submission.consensus)
                ? submission.consensus
                : null
            );
            const highCount = findings.filter(
              (f) => f.severity === "high"
            ).length;

            return (
              <li key={submission.id}>
                <Link
                  href={`/review/${submission.id}`}
                  className="flex min-h-11 flex-col gap-1 px-4 py-3 hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between sm:gap-4 dark:hover:bg-gray-900"
                >
                  <div>
                    <p className="font-medium break-words">{submission.title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {submission.language} ·{" "}
                      {new Date(submission.createdAt).toLocaleString()} ·{" "}
                      {succeeded.length} model
                      {succeeded.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-sm">
                    {succeeded.length > 0 ? (
                      <span
                        className={
                          highCount > 0
                            ? "text-red-700 dark:text-red-400 font-medium"
                            : "text-gray-500 dark:text-gray-400"
                        }
                      >
                        {findings.length} finding
                        {findings.length === 1 ? "" : "s"}
                        {highCount > 0 ? ` · ${highCount} high` : ""}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">No reviews</span>
                    )}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
