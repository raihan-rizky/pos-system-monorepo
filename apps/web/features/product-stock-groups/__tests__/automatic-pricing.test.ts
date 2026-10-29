import { describe, expect, it } from "vitest";
import {
  decimalToRatio,
  initializeGroupPricing,
  projectGroupPricing,
  roundMoney,
  adjustmentToPriceFactor,
  type GroupPricingInput,
} from "../automatic-pricing";

function snowman(): GroupPricingInput {
  return {
    groupId: "snowman", storeId: "toko", baseUnit: "pcs",
    members: [
      { id: "pcs", storeId: "toko", groupId: "snowman", unit: "pcs", price: "3000.00", costPrice: "2000.00", unitMultiplierToBase: "1", isActive: true, conversionNeedsReview: false },
      { id: "pak", storeId: "toko", groupId: "snowman", unit: "pak", price: "32400.00", costPrice: "10000.00", unitMultiplierToBase: "12", isActive: true, conversionNeedsReview: false },
    ],
  };
}

function initializeAutoPricing(input: GroupPricingInput) {
  const initial = initializeGroupPricing(input);
  for (const member of Object.values(initial.config.members)) member.mode = "AUTO";
  return projectGroupPricing({ ...input, config: initial.config });
}

describe("automatic group pricing", () => {
  it("enables Snowman AUTO at the exact old price and updates directly from the source", () => {
    const input = snowman();
    const initial = initializeAutoPricing(input);
    expect(initial.config.sourceProductId).toBe("pcs");
    expect(initial.config.members.pak).toMatchObject({ mode: "AUTO", factor: { numerator: "9", denominator: "10" } });
    expect(initial.members[1]).toMatchObject({ price: "32400.00", costPrice: "24000.00", review: { price: [], costPrice: [] } });
    input.members[0].price = "3500.00";
    expect(projectGroupPricing({ ...input, config: initial.config }).members[1].price).toBe("37800.00");
    expect(JSON.parse(JSON.stringify(initial))).toEqual(initial);
  });

  it("keeps nonterminating legacy factors exact across initialization reruns", () => {
    const input = snowman();
    input.members[1].price = "10000.01";
    const first = initializeAutoPricing(input);
    expect(first.config.members.pak.factor).toEqual({ numerator: "1000001", denominator: "3600000" });
    input.members[0].price = "3500";
    const rerun = initializeGroupPricing({ ...input, config: first.config });
    expect(rerun.config).toEqual(first.config);
    expect(rerun.initialized).toBe(false);
    expect(rerun.members[1].price).toBe("10000.01");
    expect(projectGroupPricing({ ...input, config: first.config }).members[1].price).toBe("11666.68");
  });

  it.each([["0", "0"], ["0", null], ["2000", null]])("isolates price and HPP review holds (%s/%s)", (price, costPrice) => {
    const input = snowman();
    input.members[0].price = price;
    input.members[0].costPrice = costPrice;
    const result = initializeAutoPricing(input);
    expect(result.members[1].price).toBe("32400.00");
    expect(result.members[1].costPrice).toBe(costPrice === null ? "10000.00" : "0.00");
    expect(result.members[1].review.price).toEqual(price === "0" ? ["SOURCE_PRICE_ZERO"] : []);
    expect(result.members[1].review.costPrice).toEqual(costPrice === null ? ["SOURCE_COST_UNKNOWN"] : []);
  });

  it("forms a missing factor on repair without jumping the held selling price", () => {
    const input = snowman();
    input.members[0].price = "0";
    const initial = initializeAutoPricing(input);
    expect(initial.config.members.pak.factor).toBeNull();
    input.members[0].price = "3500";
    const repaired = projectGroupPricing({ ...input, config: initial.config });
    expect(repaired.members[1].price).toBe("32400.00");
    input.members[0].price = "4000";
    expect(projectGroupPricing({ ...input, config: repaired.config }).members[1].price).toBe("37028.57");
  });

  it("uses fractional direct conversions and rounds money only once", () => {
    const input = snowman();
    input.members[0].unitMultiplierToBase = "3";
    input.members[0].price = "0.01";
    input.members[0].costPrice = "0.01";
    const initial = initializeAutoPricing(input);
    input.members.push({ ...input.members[1], id: "setengah", unitMultiplierToBase: "1.5" });
    input.members.push({ ...input.members[1], id: "satu", unitMultiplierToBase: "1" });
    initial.config.members.setengah = { mode: "AUTO", factor: { numerator: "1", denominator: "1" }, review: { price: [], costPrice: [] } };
    initial.config.members.satu = { mode: "AUTO", factor: { numerator: "1", denominator: "1" }, review: { price: [], costPrice: [] } };
    const result = projectGroupPricing({ ...input, config: initial.config });
    expect(result.members[2]).toMatchObject({ price: "0.01", costPrice: "0.01" });
    expect(result.members[3]).toMatchObject({ price: "0.00", costPrice: "0.00" });
    expect(result.config.members.setengah.factor).toEqual({ numerator: "1", denominator: "1" });
  });

  it("supports a zero factor and a factor above one", () => {
    const input = snowman();
    input.members[1].price = "0";
    const zero = initializeAutoPricing(input);
    expect(zero.config.members.pak.factor).toEqual({ numerator: "0", denominator: "1" });
    input.members[1].price = "43200";
    const increased = initializeAutoPricing(input);
    expect(increased.config.members.pak.factor).toEqual({ numerator: "6", denominator: "5" });
  });

  it("holds ambiguous, inactive and reviewed sources without selecting the first member", () => {
    for (const kind of ["ambiguous", "inactive", "reviewed"] as const) {
      const input = snowman();
      if (kind === "ambiguous") input.members.push({ ...input.members[0], id: "pcs2" });
      if (kind === "inactive") input.members[0].isActive = false;
      if (kind === "reviewed") input.members[0].conversionNeedsReview = true;
      const result = initializeAutoPricing(input);
      expect(result.config.sourceProductId).toBeNull();
      expect(result.config.members.pak.mode).toBe("AUTO");
      expect(result.members[1]).toMatchObject({ price: "32400.00", costPrice: "10000.00" });
      expect(result.members[1].review.price).toEqual([kind === "ambiguous" ? "SOURCE_AMBIGUOUS" : "SOURCE_UNAVAILABLE"]);
    }
  });

  it("does not silently replace an unavailable explicit source", () => {
    const input = snowman();
    const initial = initializeAutoPricing(input);
    input.members[0].isActive = false;
    input.members.push({ ...input.members[0], id: "other", isActive: true });
    const result = projectGroupPricing({ ...input, config: initial.config });
    expect(result.config.sourceProductId).toBe("pcs");
    expect(result.members[1].review.price).toEqual(["SOURCE_UNAVAILABLE"]);
  });

  it("holds invalid follower conversion while other members continue updating", () => {
    const input = snowman();
    const initial = initializeAutoPricing(input);
    input.members[0].price = "3500";
    input.members[1].conversionNeedsReview = true;
    const result = projectGroupPricing({ ...input, config: initial.config });
    expect(result.members[1]).toMatchObject({ price: "32400.00", costPrice: "10000.00", review: { price: ["CONVERSION_INVALID"], costPrice: ["CONVERSION_INVALID"] } });
  });

  it("keeps manual fields and supports single product or empty groups", () => {
    const input = snowman();
    const initial = initializeGroupPricing(input);
    initial.config.members.pak.mode = "MANUAL";
    input.members[0].price = "3500";
    expect(projectGroupPricing({ ...input, config: initial.config }).members[1]).toMatchObject({ price: "32400.00", costPrice: "10000.00" });
    expect(initializeGroupPricing({ ...input, members: [input.members[0]] }).config.sourceProductId).toBe("pcs");
    expect(initializeGroupPricing({ ...input, members: [] }).members).toEqual([]);
  });

  it("advances the write revision even when a source-only group has no follower changes", () => {
    const input = snowman();
    input.members = [input.members[0]];
    const initial = initializeGroupPricing(input);
    input.members[0].price = "3500";
    expect(projectGroupPricing({ ...input, config: initial.config }).config.revision).toBe(2);
    expect(initial.config.revision).toBe(1);
  });

  it.each(["store", "group", "duplicate"])("rejects %s scope corruption", (kind) => {
    const input = snowman();
    if (kind === "store") input.members[1].storeId = "other";
    if (kind === "group") input.members[1].groupId = "other";
    if (kind === "duplicate") input.members[1].id = "pcs";
    expect(() => initializeGroupPricing(input)).toThrow();
  });

  it("rejects negative factors and money overflow before saving", () => {
    const input = snowman();
    const initial = initializeGroupPricing(input);
    initial.config.members.pak.factor = { numerator: "-1", denominator: "1" };
    expect(() => projectGroupPricing({ ...input, config: initial.config })).toThrow();
    input.members[0].price = "9999999999.99";
    expect(() => projectGroupPricing({ ...input, config: initializeAutoPricing(snowman()).config })).toThrow(/kapasitas/i);
  });

  it("parses decimal exponents precisely and rounds half up at Decimal(12,2) limits", () => {
    expect(decimalToRatio("1.25e-3")).toEqual({ numerator: "1", denominator: "800" });
    expect(roundMoney({ numerator: "201", denominator: "200" })).toBe("1.01");
    expect(roundMoney(decimalToRatio("9999999999.994"))).toBe("9999999999.99");
    expect(() => roundMoney(decimalToRatio("9999999999.995"))).toThrow();
    expect(() => decimalToRatio(Infinity)).toThrow();
  });

  it("encodes exact discounts and markups without rounding percentages", () => {
    expect(adjustmentToPriceFactor("DISCOUNT", "10")).toEqual({ numerator: "9", denominator: "10" });
    expect(adjustmentToPriceFactor("DISCOUNT", "100")).toEqual({ numerator: "0", denominator: "1" });
    expect(adjustmentToPriceFactor("MARKUP", "12.3456")).toEqual({ numerator: "17554", denominator: "15625" });
    expect(() => adjustmentToPriceFactor("DISCOUNT", "100.01")).toThrow();
  });

  it("preserves selling prices while replacing the source or reactivating AUTO", () => {
    const input = snowman();
    const initial = initializeAutoPricing(input);
    initial.config.sourceProductId = "pak";
    for (const member of Object.values(initial.config.members)) member.factor = null;
    const replaced = projectGroupPricing({ ...input, config: initial.config });
    expect(replaced.members.map(member => member.price)).toEqual(["3000.00", "32400.00"]);
    expect(replaced.members[0].costPrice).toBe("833.33");
    initial.config.sourceProductId = "pcs";
    initial.config.members.pak.mode = "AUTO";
    initial.config.members.pak.factor = null;
    input.members[1].price = "32000";
    const reactivated = projectGroupPricing({ ...input, config: initial.config });
    expect(reactivated.members[1].price).toBe("32000.00");
    expect(reactivated.config.members.pak.factor).toEqual({ numerator: "8", denominator: "9" });
  });
});
