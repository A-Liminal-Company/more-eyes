import Link from "next/link";
import { notFound } from "next/navigation";
import { groupFindings, type ModelFinding } from "@/lib/consensus";
import { modelLabel } from "@/lib/models";
import { prisma } from "@/lib/prisma";
import { parseFindings } from "@/lib/types";
import type { Finding } from "@/lib/validation";

export const dynamic = "force-dynamic";

const SEVERITY_STYLES: Record<Finding["severity"], string> = {
  high: "bg-red-100 text-red-800 border-red-200",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-gray-100 text-gray-700 border-gray-200",
};

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { reviews: { orderBy: { createdAt: "asc" } } },
  });

  if (!submission) {
    notFound();
  }

  const succeeded = submission.reviews.filter((r) => r.status === "ok");
  const failed = submission.reviews.filter((r) => r.status !== "ok");

  const allFindings: ModelFinding[] = succeeded.flatMap((review) =>
    parseFindings(review.findings).map((finding) => ({
      ...finding,
      model: review.model,
    }))
  );

  const groups = groupFindings(allFindings);
  const agreed = groups.filter((g) => g.models.length > 1).length;

  return (
    <main className="mx-auto max-w-3xl w-full px-6 py-12 flex-1">
      <Link href="/" className="text-sm text-gray-500 hover:underline">
        ← All submissions
      </Link>

      <h1 className="text-2xl font-semibold mt-2 mb-1">{submission.title}</h1>
      <p className="text-sm text-gray-500 mb-8">
        {submission.language} ·{" "}
        {new Date(submission.createdAt).toLocaleString()} ·{" "}
        {succeeded.length} of {submission.reviews.length} model
        {submission.reviews.length === 1 ? "" : "s"} responded
      </p>

      {failed.length > 0 && (
        <section
          className="mb-8 rounded-md border border-amber-200 bg-amber-50 px-4 py-3"
          role="status"
        >
          <p className="text-sm font-medium text-amber-900">
            {failed.length} model{failed.length === 1 ? "" : "s"} failed
          </p>
          <ul className="mt-1 text-sm text-amber-900">
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
          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase text-gray-500 mb-3">
              Findings ({groups.length})
              {agreed > 0 && (
                <span className="ml-2 font-normal normal-case text-gray-500">
                  · {agreed} flagged by more than one model
                </span>
              )}
            </h2>

            {groups.length === 0 ? (
              <p className="text-sm text-gray-500">No issues found.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {groups.map((group, i) => (
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
                    </div>

                    <p className="text-sm font-medium">{group.title}</p>

                    <ul className="mt-2 flex flex-col gap-2">
                      {group.findings.map((finding, j) => (
                        <li key={j} className="text-sm">
                          <span className="font-medium opacity-80">
                            {modelLabel(finding.model)}
                            {finding.line != null && ` · line ${finding.line}`}
                          </span>
                          <span className="block opacity-90">
                            {finding.description}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase text-gray-500 mb-3">
              Summaries
            </h2>
            <ul className="flex flex-col gap-3">
              {succeeded.map((review) => (
                <li
                  key={review.id}
                  className="rounded-md border border-gray-200 px-4 py-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    {modelLabel(review.model)}
                  </p>
                  <p className="text-sm leading-relaxed">{review.summary}</p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">
          Code
        </h2>
        <pre className="rounded-md bg-gray-900 text-gray-100 text-xs p-4 overflow-x-auto">
          <code>{submission.code}</code>
        </pre>
      </section>
    </main>
  );
}
