import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEndpoints, type CatalogueModel } from "./catalogue";
import {
  SMALL_DIFF,
  buildLargeDiff,
  needsAttention,
  cell,
  preFilter,
  renderMarkdown,
  toCandidate,
  verdictLine,
  type HealthRow,
  type Report,
  type RunResult,
} from "./model-watch-lib";

const tools = ["tools", "max_tokens"];
const m = (id: string, created: number, extra: Partial<CatalogueModel> = {}): CatalogueModel => ({
  id,
  created,
  supported_parameters: tools,
  architecture: { output_modalities: ["text"] },
  ...extra,
});

const roster = [
  { id: "sonnet", providerModel: "anthropic/claude-sonnet-5" },
  { id: "gpt", providerModel: "openai/gpt-5.5" },
];

const catalogue: CatalogueModel[] = [
  m("anthropic/claude-sonnet-5", 100),
  m("openai/gpt-5.5", 200),
  m("anthropic/claude-new", 150), // newer than roster, same lab: keep
  m("anthropic/claude-old", 50), // older than newest anthropic: drop
  m("openai/gpt-6", 300), // keep
  m("openai/gpt-6:free", 310), // variant: drop
  m("openai/gpt-6-image", 320, { architecture: { output_modalities: ["text", "image"] } }), // drop
  m("openai/gpt-7-notools", 330, { supported_parameters: ["max_tokens"] }), // drop
  m("some-lab/other", 999), // lab not on roster: drop
];

describe("preFilter", () => {
  it("keeps newer, tool-capable, text-only models from rostered labs, newest first", () => {
    expect(preFilter(catalogue, roster).map((x) => x.id)).toEqual([
      "openai/gpt-6",
      "anthropic/claude-new",
    ]);
  });

  it("excludes models already rostered", () => {
    expect(preFilter([m("openai/gpt-5.5", 999)], roster)).toEqual([]);
  });
});

describe("toCandidate", () => {
  const allowed = new Set(["openai", "azure"]);

  it("requires at least one allowlisted provider and reports the rest", () => {
    const c = toCandidate(
      m("openai/gpt-6", 300),
      [{ tag: "openai" }, { tag: "azure/eastus" }, { tag: "together" }],
      allowed
    );
    expect(c).toMatchObject({
      id: "openai/gpt-6",
      lab: "openai",
      providers: ["openai", "azure"],
      otherProviders: ["together"],
    });
  });

  it("drops models no allowlisted provider serves", () => {
    expect(toCandidate(m("openai/gpt-6", 300), [{ tag: "together" }], allowed)).toBeNull();
    expect(toCandidate(m("openai/gpt-6", 300), [], allowed)).toBeNull();
  });
});

describe("fetchEndpoints", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads endpoints from the per-model endpoint, and is empty on failure", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { endpoints: [{ tag: "openai" }] } }) })
      .mockResolvedValueOnce({ ok: false });
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchEndpoints("openai/gpt-6")).toEqual([{ tag: "openai" }]);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://openrouter.ai/api/v1/models/openai/gpt-6/endpoints"
    );
    expect(await fetchEndpoints("openai/gpt-6")).toEqual([]);
  });
});

const okRun: RunResult = { ok: true, findings: 3, ms: 1500 };
const row = (id: string, small = okRun, large = okRun): HealthRow => ({
  modelId: id,
  providerModel: `x/${id}`,
  runs: { small, large },
});
const report = (over: Partial<Report> = {}): Report => ({
  generatedAt: "2026-10-12T05:41:00.000Z",
  healthSkipped: false,
  fixtureChars: { small: 900, large: 29000 },
  health: [row("a"), row("b")],
  candidates: [],
  ...over,
});

describe("report", () => {
  it("verdict counts models with any failed run, and new candidates", () => {
    const r = report({
      health: [
        row("a"),
        row("b", okRun, { ok: false, error: "x ran out of output tokens", ms: 40000 }),
        row("c", { ok: false, error: "timed out after 90s", ms: 90000 }, okRun),
      ],
      candidates: [
        // 2026-10-05: within RECENT_DAYS of generatedAt (2026-10-12).
        { id: "openai/gpt-6", created: Date.parse("2026-10-05T00:00:00Z") / 1000, lab: "openai", providers: ["openai"], otherProviders: [] },
      ],
    });
    expect(verdictLine(r)).toBe("MODEL_WATCH: failures=2 new=1");
    expect(needsAttention(r)).toBe(true);
  });

  it("does not count older candidates as news, so a quiet week stays quiet", () => {
    const r = report({
      candidates: [
        { id: "openai/gpt-6", created: Date.parse("2026-09-01T00:00:00Z") / 1000, lab: "openai", providers: ["openai"], otherProviders: [] },
      ],
    });
    expect(verdictLine(r)).toBe("MODEL_WATCH: failures=0 new=0");
    expect(needsAttention(r)).toBe(false);
    expect(renderMarkdown(r)).toContain("openai/gpt-6");
  });

  it("is quiet when everything passes and nothing is new", () => {
    expect(verdictLine(report())).toBe("MODEL_WATCH: failures=0 new=0");
    expect(needsAttention(report())).toBe(false);
  });

  it("renders failures with their error text, escaping table pipes", () => {
    const md = renderMarkdown(
      report({ health: [row("b", okRun, { ok: false, error: "bad | pipe\nline", ms: 2000 })] })
    );
    expect(md).toContain("| b | ok, 3 findings, 1.5s | FAILED: bad \\| pipe line (2.0s) |");
    expect(md).toContain("MODEL_WATCH: failures=1 new=0");
  });

  it("says health was skipped without a key", () => {
    expect(renderMarkdown(report({ healthSkipped: true, health: [] }))).toContain("Skipped");
  });
});

describe("fixtures", () => {
  it("small diff is 1-2k chars", () => {
    expect(SMALL_DIFF.length).toBeGreaterThan(500);
    expect(SMALL_DIFF.length).toBeLessThan(2000);
  });

  it("large diff is deterministic, in diff format, and capped near the target", () => {
    const files = [
      { path: "b.ts", content: "x\n".repeat(20000) },
      { path: "a.ts", content: "const a = 1;\nconst b = 2;" },
    ];
    const out = buildLargeDiff(files, 29000);
    expect(out).toBe(buildLargeDiff([...files].reverse(), 29000));
    expect(out.startsWith("diff --git a/a.ts b/a.ts")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(29000);
    expect(out.length).toBeGreaterThan(28000);
  });
});

describe("cell", () => {
  it("escapes backslashes before pipes, so a trailing backslash can't swallow a separator", () => {
    expect(cell("a\\|b")).toBe("a\\\\\\|b");
    expect(cell("ends\\")).toBe("ends\\\\");
    expect(cell("two\n  lines")).toBe("two lines");
  });
});
