import { describe, expect, it } from "vitest";
import { createPricingDraft, pricingChanges, selectPricingSource, adjustmentFactor, rebasePricingDraft } from "../pricing-drafts";
import { additionResult } from "../workspace-drafts";
import { snowman } from "./pricing-ui-fixture";
describe("pricing draft intent boundaries", () => {
  it("refreshes untouched money after conflict while retaining compatible changes", () => {
    const draft = createPricingDraft(snowman); draft.members.pak.mode = "MANUAL";
    const latest = structuredClone(snowman); latest.pricing!.members[0].price = "4000.00";
    const rebased = rebasePricingDraft(snowman, latest, draft);
    expect(rebased.members.pcs.price).toBe("4000.00");
    expect(pricingChanges(latest, rebased)).toEqual({ members: [{ productId: "pak", mode: "MANUAL" }] });
  });
  it("creates Auto unit without independent money inputs", () => {
    const draft = { unit: "dus", price: "", costPrice: "", stock: "0", minStock: "5", conversionFromQuantity: "1", conversionToQuantity: "24", conversionToProductId: "pcs", note: "", pricingMode: "AUTO" as const, adjustment: "discount" as const, percent: "10" };
    const result = additionResult(snowman, draft);
    expect(result.error).toBeNull();
    expect(result.payload).toMatchObject({ pricingMode: "AUTO", priceFactor: { numerator: "9", denominator: "10" }, price: 0 });
    expect(result.payload).not.toHaveProperty("costPrice");
    expect(additionResult(snowman, { ...draft, pricingMode: "MANUAL" }).error).toMatch(/harga/i);
    const broken = structuredClone(snowman); broken.pricing!.config.sourceProductId = "removed";
    expect(additionResult(broken, draft).error).toMatch(/sumber/i);
  });
  it("does not replay unchanged legacy factors when only source money changes", () => {
    const draft = createPricingDraft(snowman);
    draft.members.pcs.price = "3500";
    expect(pricingChanges(snowman, draft)).toEqual({ members: [{ productId: "pcs", price: "3500" }] });
  });
  it("binds replacement source to its own current money", () => {
    const draft = createPricingDraft(snowman); draft.members.pcs.price = "9999";
    const next = selectPricingSource(snowman, draft, "pak");
    expect(next.members.pak.price).toBe("32400.00");
    expect(pricingChanges(snowman, next)).toEqual({ sourceProductId: "pak", members: [] });
  });
  it("Manual to Auto leaves factor absent so server preserves selling", () => {
    const detail = structuredClone(snowman); detail.pricing!.config.members.pak.mode = "MANUAL";
    const draft = createPricingDraft(detail); draft.members.pak.mode = "AUTO";
    expect(pricingChanges(detail, draft)).toEqual({ members: [{ productId: "pak", mode: "AUTO" }] });
  });
  it("keeps exact nonterminating factor untouched and uses exact explicit percentages", () => {
    const detail = structuredClone(snowman); detail.pricing!.config.members.pak.factor = { numerator: "2", denominator: "3" };
    expect(pricingChanges(detail, createPricingDraft(detail))).toEqual({ members: [] });
    expect(adjustmentFactor("discount", "10")).toEqual({ numerator: "9", denominator: "10" });
    expect(adjustmentFactor("markup", "2.5")).toEqual({ numerator: "41", denominator: "40" });
  });
});
