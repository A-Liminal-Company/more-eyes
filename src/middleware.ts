import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cra_access";

export function middleware(request: NextRequest) {
  const secret = process.env.APP_ACCESS_SECRET;

  if (!secret) {
    return NextResponse.json(
      { error: "APP_ACCESS_SECRET is not configured on the server." },
      { status: 503 }
    );
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie && timingSafeEqual(cookie, secret)) {
    return NextResponse.next();
  }

  const provided =
    request.headers.get("x-access-secret") ??
    request.nextUrl.searchParams.get("secret");

  if (provided && timingSafeEqual(provided, secret)) {
    const response = NextResponse.next();
    response.cookies.set(COOKIE_NAME, secret, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  }

  return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
