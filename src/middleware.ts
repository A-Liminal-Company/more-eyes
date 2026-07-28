import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cra_access";

export function middleware(request: NextRequest) {
  const secret = process.env.APP_ACCESS_SECRET;

  if (!secret) {
    return withSecurityHeaders(
      NextResponse.json(
        { error: "APP_ACCESS_SECRET is not configured on the server." },
        { status: 503 }
      )
    );
  }

  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (cookie && timingSafeEqual(cookie, secret)) {
    return withSecurityHeaders(NextResponse.next());
  }

  const provided =
    request.headers.get("x-access-secret") ??
    request.nextUrl.searchParams.get("secret");

  if (provided && timingSafeEqual(provided, secret)) {
    const response = withSecurityHeaders(NextResponse.next());
    response.cookies.set(COOKIE_NAME, secret, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  }

  return withSecurityHeaders(
    NextResponse.json({ error: "Unauthorized." }, { status: 401 })
  );
}

export function withSecurityHeaders(response: NextResponse): NextResponse {
  const isProduction = process.env.NODE_ENV === "production";

  // Next inlines hydration scripts and Tailwind injects styles, so a nonce-free
  // policy needs 'unsafe-inline' for both. Development additionally needs
  // 'unsafe-eval' and a websocket connection for hot reload — granting those in
  // production would defeat the point, hence the split.
  const scriptSrc = isProduction
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";
  const connectSrc = isProduction ? "'self'" : "'self' ws: wss:";

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connectSrc}`,
    // No third-party embedding, plugins, or form posts off-origin.
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()"
  );

  // Only meaningful over HTTPS, and setting it in development would pin
  // localhost to https in the browser's HSTS cache.
  if (isProduction) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
  }

  return response;
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
