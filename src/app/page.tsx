import Link from "next/link";
import { groupFindings } from "@/lib/consensus";
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
    <main className="mx-auto max-w-3xl w-full px-6 py-12 flex-1">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Code Review</h1>
        <Link
          href="/submit"
          className="rounded-md bg-black text-white px-4 py-2 text-sm font-medium hover:bg-gray-800"
        >
          Submit code
        </Link>
      </div>

      {submissions.length === 0 ? (
        <p className="text-gray-500">
          No submissions yet. Submit something to get your first review.
        </p>
      ) : (
        <ul className="divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden">
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
              )
            );
            const highCount = findings.filter(
              (f) => f.severity === "high"
            ).length;

            return (
              <li key={submission.id}>
                <Link
                  href={`/review/${submission.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium">{submission.title}</p>
                    <p className="text-sm text-gray-500">
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
                            ? "text-red-700 font-medium"
                            : "text-gray-500"
                        }
                      >
                        {findings.length} finding
                        {findings.length === 1 ? "" : "s"}
                        {highCount > 0 ? ` · ${highCount} high` : ""}
                      </span>
                    ) : (
                      <span className="text-gray-400">No reviews</span>
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
