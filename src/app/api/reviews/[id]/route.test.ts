import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniqueMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    submission: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
    },
  },
}));

const { GET } = await import("./route");

const request = new NextRequest("http://localhost/api/reviews/abc");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/reviews/[id]", () => {
  it("returns 404 when the submission does not exist", async () => {
    findUniqueMock.mockResolvedValue(null);

    const res = await GET(request, {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns the submission when it exists", async () => {
    findUniqueMock.mockResolvedValue({ id: "abc", title: "Divide" });

    const res = await GET(request, {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.submission.id).toBe("abc");
  });
});
