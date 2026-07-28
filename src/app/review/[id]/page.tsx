import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { parseFindings, sortFindings } from "@/lib/types";
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
    include: { review: true },
  });

  if (!submission) {
    notFound();
  }

  const findings = submission.review
    ? sortFindings(parseFindings(submission.review.findings))
    : [];

  return (
    <main className="mx-auto max-w-3xl w-full px-6 py-12 flex-1">
      <Link href="/" className="text-sm text-gray-500 hover:underline">
        ← All submissions
      </Link>

      <h1 className="text-2xl font-semibold mt-2 mb-1">{submission.title}</h1>
      <p className="text-sm text-gray-500 mb-8">
        {submission.language} ·{" "}
        {new Date(submission.createdAt).toLocaleString()}
      </p>

      {submission.review ? (
        <>
          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase text-gray-500 mb-2">
              Summary
            </h2>
            <p className="text-sm leading-relaxed">
              {submission.review.summary}
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-sm font-semibold uppercase text-gray-500 mb-3">
              Findings ({findings.length})
            </h2>
            {findings.length === 0 ? (
              <p className="text-sm text-gray-500">No issues found.</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {findings.map((finding, i) => (
                  <li
                    key={i}
                    className={`rounded-md border px-4 py-3 ${
                      SEVERITY_STYLES[finding.severity]
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        {finding.severity}
                      </span>
                      <span className="text-xs uppercase tracking-wide opacity-70">
                        {finding.category}
                      </span>
                      {finding.line != null && (
                        <span className="text-xs opacity-70">
                          line {finding.line}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium">{finding.title}</p>
                    <p className="text-sm mt-1">{finding.description}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : (
        <p className="text-sm text-gray-500 mb-8">Review pending.</p>
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
