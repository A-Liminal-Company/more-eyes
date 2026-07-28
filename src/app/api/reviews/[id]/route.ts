import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const submission = await prisma.submission.findUnique({
    where: { id },
    include: { review: true },
  });

  if (!submission) {
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({ submission });
}
