import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
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

  const { models, ...input } = parsed.data;

  // Charged after validation so the cost reflects the real number of billed
  // model calls rather than treating every submission as equally expensive.
  const clientKey =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
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

  const submission = await prisma.submission.create({
    data: {
      ...input,
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
