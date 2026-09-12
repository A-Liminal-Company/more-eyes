import { describe, expect, it } from "vitest";
import { MAX_MODELS_PER_SUBMISSION, MODELS, getModel, modelLabel } from "./models";

describe("model registry", () => {
  it("has a unique id per entry", () => {
    const ids = MODELS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // Two entries pointing at the same slug would bill twice for one opinion and
  // show up in consensus as agreement between "different" models.
  it("has a unique provider model per entry", () => {
    const slugs = MODELS.map((m) => m.providerModel);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  // The cap is allowed to sit below the registry size — that is how a model on
  // trial stays a swap rather than an addition — but never above it, which
  // would advertise a selection no user can make.
  it("caps a submission at no more than the registry holds", () => {
    expect(MAX_MODELS_PER_SUBMISSION).toBeGreaterThan(0);
    expect(MAX_MODELS_PER_SUBMISSION).toBeLessThanOrEqual(MODELS.length);
  });

  it("looks entries up by id and falls back to the id for an unknown label", () => {
    expect(getModel("glm-5.3-flash")?.providerModel).toBe("z-ai/glm-5.3-flash");
    expect(modelLabel("glm-5.3-flash")).toBe("GLM 5.3 Flash");
    expect(getModel("stealth/ox-alpha")).toBeUndefined();
    expect(modelLabel("stealth/ox-alpha")).toBe("stealth/ox-alpha");
  });
});
