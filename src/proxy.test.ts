import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { issueToken } from "@/lib/access-token";
import { proxy } from "./proxy";

const SECRET = "test-secret-value";
const COOKIE = "cra_access";

beforeEach(() => {
  process.env.APP_ACCESS_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.APP_ACCESS_SECRET;
});

function request(
  path = "/",
  init?: { cookie?: string; header?: string }
): NextRequest {
  const headers = new Headers();
  if (init?.cookie) headers.set("cookie", `${COOKIE}=${init.cookie}`);
  if (init?.header) headers.set("x-access-secret", init.header);
  return new NextRequest(`http://localhost${path}`, { headers });
}

/** The cookie value the response asks the browser to store, if any. */
function setCookieValue(response: Response): string | undefined {
  const header = response.headers.get("set-cookie");
  return header?.match(new RegExp(`${COOKIE}=([^;]*)`))?.[1];
}

describe("access gate", () => {
  it("returns 401 without a cookie or secret", () => {
    expect(proxy(request()).status).toBe(401);
  });

  it("returns 503 rather than failing open when no secret is configured", () => {
    delete process.env.APP_ACCESS_SECRET;
    expect(proxy(request()).status).toBe(503);
  });

  it("leaves the healthcheck reachable, so deploys are not rolled back", () => {
    expect(proxy(request("/api/health")).status).toBe(200);
  });

  it("accepts a valid token cookie", () => {
    const response = proxy(request("/", { cookie: issueToken(SECRET) }));
    expect(response.status).toBe(200);
  });

  it("rejects a cookie holding the raw secret", () => {
    // This is what pre-S-6 cookies contained. Presenting the credential itself
    // is no longer a way in.
    expect(proxy(request("/", { cookie: SECRET })).status).toBe(401);
  });

  it("rejects a token signed with a different secret", () => {
    const forged = issueToken("some-other-secret");
    expect(proxy(request("/", { cookie: forged })).status).toBe(401);
  });

  it("rejects a wrong secret", () => {
    expect(proxy(request("/", { header: "wrong" })).status).toBe(401);
  });
});

describe("S-6 — the cookie carries a derived token, not the secret", () => {
  it("stores a signed token when the header path is used", () => {
    const value = setCookieValue(proxy(request("/", { header: SECRET })));

    expect(value).toBeDefined();
    expect(value).not.toBe(SECRET);
    expect(value).not.toContain(SECRET);
    expect(value).toMatch(/^v1\.\d+\.[0-9a-f]+\./);
  });

  it("issues a distinct token per unlock", () => {
    const first = setCookieValue(proxy(request("/", { header: SECRET })));
    const second = setCookieValue(proxy(request("/", { header: SECRET })));

    expect(first).not.toBe(second);
  });
});

describe("S-7 — the secret does not linger in the URL", () => {
  it("redirects to the same path with the parameter removed", () => {
    const response = proxy(
      new NextRequest(`http://localhost/submit?secret=${SECRET}&keep=yes`)
    );

    expect(response.status).toBe(307);

    const location = new URL(response.headers.get("location") as string);
    expect(location.pathname).toBe("/submit");
    expect(location.searchParams.get("secret")).toBeNull();
    // Unrelated query parameters survive the round trip.
    expect(location.searchParams.get("keep")).toBe("yes");
  });

  it("sets the access cookie on the redirect, so the unlock still lands", () => {
    const response = proxy(
      new NextRequest(`http://localhost/?secret=${SECRET}`)
    );

    const value = setCookieValue(response);
    expect(value).toMatch(/^v1\./);
    // And that cookie is immediately usable on the redirected request.
    expect(proxy(request("/", { cookie: value })).status).toBe(200);
  });

  it("does not redirect when the secret came from the header", () => {
    expect(proxy(request("/", { header: SECRET })).status).toBe(200);
  });

  it("strips the parameter even when the cookie already authorised", () => {
    // Someone with a working session following a shared `?secret=` link would
    // otherwise leave the secret sitting in their address bar.
    const headers = new Headers();
    headers.set("cookie", `${COOKIE}=${issueToken(SECRET)}`);
    const response = proxy(
      new NextRequest(`http://localhost/?secret=${SECRET}`, { headers })
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).not.toContain(SECRET);
    // Already authorised, so there is no need to reissue the cookie.
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not redirect for a wrong secret in the query string", () => {
    const response = proxy(new NextRequest("http://localhost/?secret=wrong"));
    expect(response.status).toBe(401);
  });
});

describe("security headers", () => {
  it("are set on every response, authorised or not", () => {
    for (const response of [
      proxy(request()),
      proxy(request("/api/health")),
      proxy(request("/", { cookie: issueToken(SECRET) })),
    ]) {
      expect(response.headers.get("Content-Security-Policy")).toContain(
        "default-src 'self'"
      );
      expect(response.headers.get("X-Frame-Options")).toBe("DENY");
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    }
  });

  it("are set on the unlock redirect too", () => {
    const response = proxy(
      new NextRequest(`http://localhost/?secret=${SECRET}`)
    );
    expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
