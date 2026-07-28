import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { ReviewError, reviewCode } from "@/lib/review";
import { submissionInputSchema } from "@/lib/validation";

export async function GET() {
  const submissions = await prisma.submission.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { review: true },
  });

  return NextResponse.json({ submissions });
}

export async function POST(request: NextRequest) {
  const clientKey =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  const { allowed, retryAfterSeconds } = checkRateLimit(clientKey);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many review requests. Please wait a moment." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
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

  const input = parsed.data;

  let result;
  try {
    result = await reviewCode(input);
  } catch (err) {
    if (err instanceof ReviewError) {
      console.error("[reviews] review failed:", err.message);
      return NextResponse.json({ error: err.message }, { status: 502 });
    }
    throw err;
  }

  const submission = await prisma.submission.create({
    data: {
      title: input.title,
      description: input.description,
      language: input.language,
      code: input.code,
      review: {
        create: {
          summary: result.summary,
          findings: result.findings,
          model: process.env.CLAUDE_MODEL ?? "claude-sonnet-5",
        },
      },
    },
    include: { review: true },
  });

  return NextResponse.json({ submission }, { status: 201 });
}
