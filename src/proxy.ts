import { NextRequest, NextResponse } from "next/server";
import {
  TOKEN_MAX_AGE_MS,
  issueToken,
  safeEqual,
  verifyToken,
} from "@/lib/access-token";

const COOKIE_NAME = "cra_access";
const SECRET_PARAM = "secret";

export function proxy(request: NextRequest) {
  // The platform healthcheck must not be gated: a 401 there reads as an
  // unhealthy container and every deploy gets rolled back. It exposes no
  // submission data — only whether the process and database are reachable.
  if (request.nextUrl.pathname === "/api/health") {
    return withSecurityHeaders(NextResponse.next());
  }

  const secret = process.env.APP_ACCESS_SECRET;

  if (!secret) {
    return withSecurityHeaders(
      NextResponse.json(
        { error: "APP_ACCESS_SECRET is not configured on the server." },
        { status: 503 }
      )
    );
  }

  const fromHeader = request.headers.get("x-access-secret");
  const fromQuery = request.nextUrl.searchParams.get(SECRET_PARAM);

  /**
   * A secret in the query string ends up in browser history, access logs, and
   * Referer headers, so any granted request carrying one is redirected to the
   * same URL without it. Only the single navigation that carried the secret is
   * exposed; everything after it is clean.
   *
   * Applied to an already-authorised request too, not just the unlock — someone
   * with a working cookie following a shared `?secret=` link would otherwise
   * leave it sitting in the address bar. Refused requests are not redirected:
   * a 401 is the answer, and redirecting first would only leak the attempt into
   * one more log line.
   */
  const grant = (setCookie: boolean): NextResponse => {
    let response: NextResponse;

    if (fromQuery !== null) {
      const clean = request.nextUrl.clone();
      clean.searchParams.delete(SECRET_PARAM);
      response = withSecurityHeaders(NextResponse.redirect(clean));
    } else {
      response = withSecurityHeaders(NextResponse.next());
    }

    if (setCookie) {
      response.cookies.set(COOKIE_NAME, issueToken(secret), {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: TOKEN_MAX_AGE_MS / 1000,
      });
    }

    return response;
  };

  if (verifyToken(request.cookies.get(COOKIE_NAME)?.value, secret)) {
    return grant(false);
  }

  const provided = fromHeader ?? fromQuery;
  if (provided && safeEqual(provided, secret)) {
    return grant(true);
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

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
