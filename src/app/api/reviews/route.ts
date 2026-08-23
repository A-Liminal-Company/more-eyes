import { NextRequest, NextResponse } from "next/server";
import { clientKeyFor } from "@/lib/client-key";
import { groupFindings, type ModelFinding } from "@/lib/consensus";
import { proposeMerges } from "@/lib/consensus-llm";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  redTeamGroups,
  redTeamModel,
  selectForRedTeam,
  type RedTeamAssignment,
} from "@/lib/redteam";
import { reviewWithModels } from "@/lib/review";
import { MAX_CODE_LENGTH, submissionInputSchema } from "@/lib/validation";

/** Code cap plus generous headroom for the other fields and JSON overhead. */
const MAX_REQUEST_BYTES = MAX_CODE_LENGTH + 16_000;

export async function GET() {
  const submissions = await prisma.submission.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { reviews: true },
  });

  return NextResponse.json({ submissions });
}

export async function POST(request: NextRequest) {
  // Checked before parsing: zod's length caps only apply once the whole body is
  // already in memory. Generous enough for the largest valid submission, and it
  // is what makes parsing ahead of the rate-limit check safe.
  const declaredSize = Number(request.headers.get("content-length") ?? 0);
  if (declaredSize > MAX_REQUEST_BYTES) {
    return NextResponse.json(
      { error: "Request body is too large." },
      { status: 413 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const parsed = submissionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(" ") },
      { status: 400 }
    );
  }

  const { models, previousSubmissionId, ...input } = parsed.data;

  const clientKey = clientKeyFor(request);

  // Charged after validation so the cost reflects the real number of billed
  // model calls rather than treating every submission as equally expensive.
  const { allowed, retryAfterSeconds } = checkRateLimit(
    clientKey,
    models.length
  );

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many review requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }

  const results = await reviewWithModels(models, input);

  // Only give up when nothing succeeded — otherwise persist what came back and
  // let the review page show which models failed.
  if (results.every((r) => r.status === "failed")) {
    const failed = results.find((r) => r.status === "failed");
    return NextResponse.json(
      {
        error:
          failed && failed.status === "failed"
            ? failed.error
            : "Every model failed to return a review.",
      },
      { status: 502 }
    );
  }

  // Grouping is recomputed on every render, so anything that costs a model call
  // has to happen here, once, and be stored. Returns null when the pass is
  // disabled or fails, in which case rendering falls back to lexical grouping.
  const succeeded = results.filter((r) => r.status === "ok");
  const allFindings: ModelFinding[] = succeeded.flatMap((r) =>
    r.status === "ok"
      ? r.result.findings.map((f) => ({ ...f, model: r.modelId }))
      : []
  );
  const consensus = await proposeMerges(
    groupFindings(allFindings),
    allFindings
  );

  // Regrouped with the assignment applied, because merging changes which groups
  // qualify for a red-team attempt: two single-model groups becoming one
  // corroborated group flips it into the focused view. Gating on the pre-merge
  // lexical groups would pick the wrong set. This is also exactly what the
  // review page recomputes at render time, so the keys line up.
  const finalGroups = groupFindings(allFindings, consensus);

  // Red-team calls are chosen server-side from the findings, so the charge above
  // — which counts the models the client asked for — cannot see them. Charge
  // them separately, and when the budget is gone skip the pass rather than
  // rejecting: the review itself already succeeded, and this is an enhancement
  // on top of it.
  let redTeam: RedTeamAssignment | null = null;
  const redTeamCount = redTeamModel()
    ? selectForRedTeam(finalGroups).length
    : 0;

  if (redTeamCount > 0) {
    if (checkRateLimit(clientKey, redTeamCount).allowed) {
      redTeam = await redTeamGroups(finalGroups, allFindings, input);
    } else {
      console.warn(
        `[redteam] skipped: ${redTeamCount} exploit attempts exceed the remaining rate-limit budget.`
      );
    }
  }

  // A predecessor that no longer exists (deleted, or just a bad id) shouldn't
  // block this review — it just isn't linked. The route persists null rather
  // than 400ing.
  let verifiedPreviousSubmissionId: string | null = null;
  if (previousSubmissionId) {
    const previous = await prisma.submission.findUnique({
      where: { id: previousSubmissionId },
      select: { id: true },
    });
    verifiedPreviousSubmissionId = previous ? previous.id : null;
  }

  const submission = await prisma.submission.create({
    data: {
      ...input,
      previousSubmissionId: verifiedPreviousSubmissionId,
      consensus: consensus ?? undefined,
      redTeam: redTeam ?? undefined,
      reviews: {
        create: results.map((r) =>
          r.status === "ok"
            ? {
                model: r.modelId,
                status: "ok",
                summary: r.result.summary,
                findings: r.result.findings,
              }
            : { model: r.modelId, status: "failed", error: r.error }
        ),
      },
    },
    include: { reviews: true },
  });

  return NextResponse.json({ submission }, { status: 201 });
}
