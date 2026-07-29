import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Platform healthcheck. Exempt from the access gate in middleware — a gated
 * healthcheck returns 401 and the platform marks every deploy failed.
 *
 * Reports the database separately from the process so a healthy container with
 * an unreachable database is still visible as degraded rather than simply "up".
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error("[health] database unreachable:", err);
    return NextResponse.json(
      { status: "degraded", database: "unreachable" },
      { status: 503 }
    );
  }

  return NextResponse.json({ status: "ok", database: "ok" });
}
