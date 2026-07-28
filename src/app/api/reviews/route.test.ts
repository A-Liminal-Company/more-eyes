import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimit } from "@/lib/rate-limit";
import { ReviewError } from "@/lib/review";

const createMock = vi.fn();
const reviewCodeMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    submission: {
      create: (...args: unknown[]) => createMock(...args),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@/lib/review", async () => {
  const actual = await vi.importActual<typeof import("@/lib/review")>(
    "@/lib/review"
  );
  return {
    ...actual,
    reviewCode: (...args: unknown[]) => reviewCodeMock(...args),
  };
});

const { POST } = await import("./route");

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  title: "Divide",
  description: "Divides two numbers",
  language: "typescript",
  code: "const d = (a, b) => a / b;",
};

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimit();
});

describe("POST /api/reviews", () => {
  it("returns 400 when the body fails validation", async () => {
    const res = await POST(postRequest({ ...validBody, title: "" }));

    expect(res.status).toBe(400);
    expect(reviewCodeMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const request = new NextRequest("http://localhost/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    const res = await POST(request);
    expect(res.status).toBe(400);
  });

  it("returns 502 and persists nothing when the review fails", async () => {
    reviewCodeMock.mockRejectedValue(new ReviewError("no api key"));

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(502);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 201 and persists the submission on success", async () => {
    reviewCodeMock.mockResolvedValue({
      summary: "Looks fine.",
      findings: [
        {
          severity: "high",
          category: "bug",
          title: "Division by zero",
          description: "b may be 0.",
        },
      ],
    });
    createMock.mockResolvedValue({ id: "abc123" });

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(201);
    expect(createMock).toHaveBeenCalledOnce();

    const persisted = createMock.mock.calls[0][0].data;
    expect(persisted.title).toBe(validBody.title);
    expect(persisted.review.create.findings).toHaveLength(1);
  });

  it("returns 429 once the rate limit is exceeded", async () => {
    reviewCodeMock.mockResolvedValue({ summary: "ok", findings: [] });
    createMock.mockResolvedValue({ id: "abc123" });

    for (let i = 0; i < 5; i++) {
      const res = await POST(postRequest(validBody));
      expect(res.status).toBe(201);
    }

    const limited = await POST(postRequest(validBody));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });
});
