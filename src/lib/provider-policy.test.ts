import { describe, expect, it } from "vitest";
import { MODELS } from "./models";
import {
  ALLOWED_PROVIDERS,
  PROVIDER_ROUTING,
  SECONDARY_JURISDICTION_SIGNAL,
  withProviderRouting,
} from "./provider-policy";

/**
 * These are policy tests, not behaviour tests. They exist so that removing the
 * routing pin, or quietly re-adding a model whose provider is out of policy,
 * fails here rather than being noticed months later in a provider's access log.
 *
 * The policy's actual test is **corporate control** — which legal entity ends
 * up holding submitted code and what it may do with it. That is a judgement no
 * assertion can make, so what is testable is narrower: that the pin exists,
 * that known out-of-policy providers stay off the list, and that the roster has
 * not drifted. The live-catalogue half — which providers actually serve each
 * slug today — is checked by `npm run check:models`, which CI runs separately.
 */
describe("provider policy", () => {
  it("pins every request to the allowlist, with fallback confined to it", () => {
    expect(PROVIDER_ROUTING.only).toEqual([...ALLOWED_PROVIDERS]);
    // Fallback stays on so an outage at one allowlisted provider is survivable;
    // `only` is what stops fallback wandering outside the list.
    expect(PROVIDER_ROUTING.allow_fallbacks).toBe(true);
  });

  it("refuses providers that may store submissions", () => {
    // Distinct from the allowlist, which answers *who* receives the code. This
    // answers whether they may keep it — a provider can pass on corporate
    // control and still retain and train on submissions. OpenRouter's default
    // is "allow", so an unset field is an opt-in to the permissive behaviour,
    // which is why this is asserted rather than left to a comment.
    expect(PROVIDER_ROUTING.data_collection).toBe("deny");
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

  it("keeps the region list as a secondary signal covering the PRC data-access jurisdictions", () => {
    // Corroborating only. The enforcement is ALLOWED_PROVIDERS; this list just
    // annotates *why* something outside it is worth a second look, and it is
    // silent for the ~75% of providers that publish no datacenter list.
    expect([...SECONDARY_JURISDICTION_SIGNAL].sort()).toEqual([
      "CN",
      "HK",
      "MO",
    ]);
  });

  it("keeps providers under Chinese corporate control off the allowlist", () => {
    // Slugs observed serving the two models removed from the roster. `alibaba`
    // is the one that mattered — it was serving qwen3-coder, and Alibaba Cloud
    // is a Chinese company. The CN datacenter OpenRouter lists for it was
    // corroboration, not the reason.
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

  it("admits no intermediary resellers, only labs and hyperscaler clouds", () => {
    // The allowlist's defining property is that each entry is either the lab
    // that built the model or a first-party hyperscaler cloud — so the
    // counterparty holding the code is one whose terms are already known.
    // GPU resellers are excluded not as untrustworthy but as unreviewed: each
    // is a separate judgement about retention and training terms. Adding one
    // should be a deliberate act that breaks this test first.
    for (const slug of [
      "deepinfra",
      "together",
      "baseten",
      "novita",
      "parasail",
      "nebius",
      "crusoe",
      "venice",
      "atlas-cloud",
      "chutes",
    ]) {
      expect(ALLOWED_PROVIDERS as readonly string[]).not.toContain(slug);
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
