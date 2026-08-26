import { describe, expect, it } from "vitest";
import { MODELS } from "./models";
import {
  ALLOWED_PROVIDERS,
  EXCLUDED_JURISDICTIONS,
  PROVIDER_ROUTING,
  withProviderRouting,
} from "./provider-policy";

/**
 * These are policy tests, not behaviour tests. They exist so that removing the
 * routing pin, or quietly re-adding a model whose lab is out of policy, fails
 * here rather than being noticed months later in a provider's access log.
 *
 * The live-catalogue half of the policy — which providers actually serve each
 * slug today — cannot be asserted offline and is checked by
 * `npm run check:models`, which CI runs separately.
 */
describe("jurisdiction policy", () => {
  it("pins every request to the allowlist, with fallback confined to it", () => {
    expect(PROVIDER_ROUTING.only).toEqual([...ALLOWED_PROVIDERS]);
    // Fallback stays on so an outage at one allowlisted provider is survivable;
    // `only` is what stops fallback wandering outside the list.
    expect(PROVIDER_ROUTING.allow_fallbacks).toBe(true);
  });

  it("attaches routing without disturbing the caller's params", () => {
    const params = { model: "anthropic/claude-sonnet-5", max_tokens: 42 };
    const routed = withProviderRouting(params) as typeof params & {
      provider: typeof PROVIDER_ROUTING;
    };

    expect(routed.model).toBe(params.model);
    expect(routed.max_tokens).toBe(42);
    expect(routed.provider).toEqual(PROVIDER_ROUTING);
    // Must not mutate — the same params object is reused across retries.
    expect(params).not.toHaveProperty("provider");
  });

  it("excludes the PRC data-access jurisdictions, not just the mainland", () => {
    expect([...EXCLUDED_JURISDICTIONS].sort()).toEqual(["CN", "HK", "MO"]);
  });

  it("keeps known out-of-policy providers off the allowlist", () => {
    // Slugs observed serving the two models removed from the roster. `alibaba`
    // is the one that mattered: OpenRouter lists a CN datacenter for it, and it
    // was serving qwen3-coder.
    for (const slug of [
      "alibaba",
      "deepseek",
      "siliconflow",
      "tencent",
      "baidu",
      "xiaomi",
      "novita",
      "z-ai",
      "moonshotai",
      "minimax",
    ]) {
      expect(ALLOWED_PROVIDERS as readonly string[]).not.toContain(slug);
    }
  });

  it("rosters no model from an out-of-policy lab", () => {
    const excludedLabs = [
      "deepseek",
      "qwen",
      "alibaba",
      "tencent",
      "baidu",
      "moonshot",
      "z.ai",
      "zhipu",
      "minimax",
      "01.ai",
      "bytedance",
      "stepfun",
      "xiaomi",
    ];

    for (const model of MODELS) {
      const lab = model.lab.toLowerCase();
      // The provider slug namespace is the other half — a US-labelled entry
      // pointing at `qwen/...` would pass a lab check alone.
      const namespace = model.providerModel.split("/")[0].toLowerCase();

      for (const excluded of excludedLabs) {
        expect(lab, `${model.id} lab`).not.toContain(excluded);
        expect(namespace, `${model.id} slug namespace`).not.toContain(excluded);
      }
    }
  });

  it("rosters at least two labs, so the policy has not collapsed diversity", () => {
    // The point of the app is cross-lab disagreement. If the jurisdiction
    // filter ever leaves one lab standing, the product no longer does its job
    // and that should break a build, not go unnoticed.
    const labs = new Set(MODELS.map((m) => m.lab));
    expect(labs.size).toBeGreaterThanOrEqual(2);
  });
});
