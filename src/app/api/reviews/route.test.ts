import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimit } from "@/lib/rate-limit";

const createMock = vi.fn();
const reviewWithModelsMock = vi.fn();

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
    reviewWithModels: (...args: unknown[]) => reviewWithModelsMock(...args),
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
  models: ["claude-sonnet-5"],
};

const okResult = {
  modelId: "claude-sonnet-5",
  status: "ok",
  result: {
    summary: "Looks fine.",
    findings: [
      {
        severity: "high",
        category: "bug",
        title: "Division by zero",
        description: "b may be 0.",
      },
    ],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimit();
});

describe("POST /api/reviews", () => {
  it("returns 400 when the body fails validation", async () => {
    const res = await POST(postRequest({ ...validBody, title: "" }));

    expect(res.status).toBe(400);
    expect(reviewWithModelsMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is not valid JSON", async () => {
    const request = new NextRequest("http://localhost/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect((await POST(request)).status).toBe(400);
  });

  it("returns 400 when no models are selected", async () => {
    const res = await POST(postRequest({ ...validBody, models: [] }));

    expect(res.status).toBe(400);
    expect(reviewWithModelsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown model id", async () => {
    const res = await POST(
      postRequest({ ...validBody, models: ["not-a-real-model"] })
    );

    expect(res.status).toBe(400);
    expect(reviewWithModelsMock).not.toHaveBeenCalled();
  });

  it("deduplicates repeated model ids before dispatching", async () => {
    reviewWithModelsMock.mockResolvedValue([okResult]);
    createMock.mockResolvedValue({ id: "abc123" });

    await POST(
      postRequest({
        ...validBody,
        models: ["claude-sonnet-5", "claude-sonnet-5"],
      })
    );

    expect(reviewWithModelsMock).toHaveBeenCalledWith(
      ["claude-sonnet-5"],
      expect.anything()
    );
  });

  it("returns 502 and persists nothing when every model fails", async () => {
    reviewWithModelsMock.mockResolvedValue([
      { modelId: "claude-sonnet-5", status: "failed", error: "no api key" },
      { modelId: "gpt-5.5", status: "failed", error: "no api key" },
    ]);

    const res = await POST(
      postRequest({ ...validBody, models: ["claude-sonnet-5", "gpt-5.5"] })
    );

    expect(res.status).toBe(502);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("persists successes and failures together on partial failure", async () => {
    reviewWithModelsMock.mockResolvedValue([
      okResult,
      { modelId: "gpt-5.5", status: "failed", error: "upstream 500" },
    ]);
    createMock.mockResolvedValue({ id: "abc123" });

    const res = await POST(
      postRequest({ ...validBody, models: ["claude-sonnet-5", "gpt-5.5"] })
    );

    expect(res.status).toBe(201);

    const created = createMock.mock.calls[0][0].data.reviews.create;
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ model: "claude-sonnet-5", status: "ok" });
    expect(created[1]).toMatchObject({
      model: "gpt-5.5",
      status: "failed",
      error: "upstream 500",
    });
  });

  it("returns 201 and persists the submission on success", async () => {
    reviewWithModelsMock.mockResolvedValue([okResult]);
    createMock.mockResolvedValue({ id: "abc123" });

    const res = await POST(postRequest(validBody));

    expect(res.status).toBe(201);

    const persisted = createMock.mock.calls[0][0].data;
    expect(persisted.title).toBe(validBody.title);
    expect(persisted.reviews.create[0].findings).toHaveLength(1);
  });

  it("returns 429 once the rate limit is exceeded", async () => {
    reviewWithModelsMock.mockResolvedValue([okResult]);
    createMock.mockResolvedValue({ id: "abc123" });

    // Budget is 30 model calls per window; one model per submission.
    for (let i = 0; i < 30; i++) {
      expect((await POST(postRequest(validBody))).status).toBe(201);
    }

    const limited = await POST(postRequest(validBody));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  it("charges the rate limit per model, not per submission", async () => {
    reviewWithModelsMock.mockResolvedValue([okResult]);
    createMock.mockResolvedValue({ id: "abc123" });

    const sixModels = {
      ...validBody,
      models: [
        "claude-sonnet-5",
        "gpt-5.5",
        "gemini-3.5-flash",
        "grok-4.5",
        "deepseek-v3.1",
        "qwen3-coder",
      ],
    };

    // Five six-model submissions exhaust the same 30-call budget that thirty
    // single-model submissions would.
    for (let i = 0; i < 5; i++) {
      expect((await POST(postRequest(sixModels))).status).toBe(201);
    }

    expect((await POST(postRequest(sixModels))).status).toBe(429);
  });

  it("rejects a body larger than the size guard before parsing", async () => {
    const request = new NextRequest("http://localhost/api/reviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "content-length": String(10_000_000),
      },
      body: JSON.stringify(validBody),
    });

    const res = await POST(request);

    expect(res.status).toBe(413);
    expect(reviewWithModelsMock).not.toHaveBeenCalled();
  });
});
