import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimit } from "@/lib/rate-limit";

const createMock = vi.fn();
const reviewWithModelsMock = vi.fn();
const findUniqueMock = vi.fn();
const redTeamGroupsMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    submission: {
      create: (...args: unknown[]) => createMock(...args),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
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

vi.mock("@/lib/redteam", async () => {
  const actual = await vi.importActual<typeof import("@/lib/redteam")>(
    "@/lib/redteam"
  );
  return {
    ...actual,
    redTeamGroups: (...args: unknown[]) => redTeamGroupsMock(...args),
  };
});

const { POST } = await import("./route");

function postRequest(body: unknown, forwardedFor?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;

  return new NextRequest("http://localhost/api/reviews", {
    method: "POST",
    headers,
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
  findUniqueMock.mockResolvedValue(null);
  redTeamGroupsMock.mockResolvedValue(null);
  delete process.env.REDTEAM_MODEL;
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

  it("does not let a rotating X-Forwarded-For reset the budget", async () => {
    reviewWithModelsMock.mockResolvedValue([okResult]);
    createMock.mockResolvedValue({ id: "abc123" });

    // Every request claims a different origin, but the trusted proxy's own
    // entry — the rightmost — is the same each time. Reading the leftmost, as
    // this route used to, gave each request a fresh 30-call budget.
    for (let i = 0; i < 30; i++) {
      const res = await POST(
        postRequest(validBody, `10.0.0.${i}, 203.0.113.5`)
      );
      expect(res.status).toBe(201);
    }

    const limited = await POST(
      postRequest(validBody, "10.0.0.250, 203.0.113.5")
    );
    expect(limited.status).toBe(429);
  });

  it("persists previousSubmissionId when it resolves to an existing submission", async () => {
    reviewWithModelsMock.mockResolvedValue([okResult]);
    createMock.mockResolvedValue({ id: "abc123" });
    findUniqueMock.mockResolvedValue({ id: "prev-1" });

    await POST(
      postRequest({ ...validBody, previousSubmissionId: "prev-1" })
    );

    expect(findUniqueMock).toHaveBeenCalledWith({
      where: { id: "prev-1" },
      select: { id: true },
    });
    expect(createMock.mock.calls[0][0].data.previousSubmissionId).toBe(
      "prev-1"
    );
  });

  it("persists null for a previousSubmissionId that does not exist, rather than 400ing", async () => {
    reviewWithModelsMock.mockResolvedValue([okResult]);
    createMock.mockResolvedValue({ id: "abc123" });
    findUniqueMock.mockResolvedValue(null);

    const res = await POST(
      postRequest({ ...validBody, previousSubmissionId: "does-not-exist" })
    );

    expect(res.status).toBe(201);
    expect(createMock.mock.calls[0][0].data.previousSubmissionId).toBeNull();
  });

  it("does not look up a predecessor when previousSubmissionId is absent", async () => {
    reviewWithModelsMock.mockResolvedValue([okResult]);
    createMock.mockResolvedValue({ id: "abc123" });

    await POST(postRequest(validBody));

    expect(findUniqueMock).not.toHaveBeenCalled();
    expect(createMock.mock.calls[0][0].data.previousSubmissionId).toBeNull();
  });

  it("does not run the red-team pass when REDTEAM_MODEL is unset", async () => {
    reviewWithModelsMock.mockResolvedValue([okResult]);
    createMock.mockResolvedValue({ id: "abc123" });

    await POST(postRequest(validBody));

    expect(redTeamGroupsMock).not.toHaveBeenCalled();
    expect(createMock.mock.calls[0][0].data.redTeam).toBeUndefined();
  });

  it("persists the assignment the red-team pass returns", async () => {
    process.env.REDTEAM_MODEL = "some/model";
    reviewWithModelsMock.mockResolvedValue([okResult]);
    createMock.mockResolvedValue({ id: "abc123" });

    const assignment = {
      v: 1,
      results: {
        "claude-sonnet-5#0": {
          demonstrated: true,
          exploit: "Call with b = 0.",
          reasoning: "The divisor is unchecked.",
        },
      },
    };
    redTeamGroupsMock.mockResolvedValue(assignment);

    await POST(postRequest(validBody));

    expect(createMock.mock.calls[0][0].data.redTeam).toEqual(assignment);
  });

  it("red-teams the grouped findings, not the raw findings", async () => {
    process.env.REDTEAM_MODEL = "some/model";
    reviewWithModelsMock.mockResolvedValue([okResult]);
    createMock.mockResolvedValue({ id: "abc123" });

    await POST(postRequest(validBody));

    const [groups, allFindings, input] = redTeamGroupsMock.mock.calls[0];
    // A group carries the models that flagged it; a raw finding does not.
    expect(groups[0]).toMatchObject({
      title: "Division by zero",
      models: ["claude-sonnet-5"],
    });
    expect(allFindings[0]).toMatchObject({ model: "claude-sonnet-5" });
    expect(input.code).toBe(validBody.code);
  });

  it("charges the red-team pass against the same budget the models use", async () => {
    process.env.REDTEAM_MODEL = "some/model";
    reviewWithModelsMock.mockResolvedValue([okResult]);
    createMock.mockResolvedValue({ id: "abc123" });

    // One model plus one qualifying finding is two billed calls, so the 30-call
    // window affords 15 submissions rather than 30. Without the extra charge,
    // red-team calls would be spent off the books entirely.
    for (let i = 0; i < 15; i++) {
      expect((await POST(postRequest(validBody))).status).toBe(201);
    }

    expect((await POST(postRequest(validBody))).status).toBe(429);
  });

  it("skips the red-team pass rather than failing when the budget is exhausted", async () => {
    reviewWithModelsMock.mockResolvedValue([okResult]);
    createMock.mockResolvedValue({ id: "abc123" });

    // Burn the window down to exactly one call left, with the pass off so each
    // submission costs one.
    for (let i = 0; i < 29; i++) {
      expect((await POST(postRequest(validBody))).status).toBe(201);
    }

    // Now the review itself still fits, but the red-team charge on top does not.
    process.env.REDTEAM_MODEL = "some/model";
    redTeamGroupsMock.mockClear();

    const res = await POST(postRequest(validBody));

    // The review succeeded, so it is persisted — only the enhancement is
    // dropped. Rejecting here would fail a submission over an optional extra.
    expect(res.status).toBe(201);
    expect(redTeamGroupsMock).not.toHaveBeenCalled();
    expect(createMock.mock.calls.at(-1)?.[0].data.redTeam).toBeUndefined();
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
