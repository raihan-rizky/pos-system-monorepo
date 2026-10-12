import { describe, expect, it } from "vitest";
import {
  getPricingMethod,
  toggleCustomerTarget,
  validatePricingForm,
  previewPricingForm,
} from "../pricing-form";

const form = {
  categoryId: "paper",
  unit: "rim",
  customerTypes: ["UMUM", "AGEN"] as const,
  brandId: "",
  mode: "COST_PLUS_FLAT" as const,
  value: "4000",
  isActive: true,
};

describe("friendly pricing form", () => {
  it("exposes clear labels for both formulas", () => {
    expect(getPricingMethod("COST_PLUS_FLAT").label).toBe("Modal + rupiah");
    expect(getPricingMethod("COST_PLUS_PERCENT").valueLabel).toBe(
      "Tambahan (%)",
    );
  });
  it("allows multiple customer targets and keeps ALL exclusive", () => {
    expect(toggleCustomerTarget(["ALL"], "UMUM")).toEqual(["UMUM"]);
    expect(toggleCustomerTarget(["UMUM"], "AGEN")).toEqual(["UMUM", "AGEN"]);
    expect(toggleCustomerTarget(["UMUM", "AGEN"], "ALL")).toEqual(["ALL"]);
    expect(toggleCustomerTarget(["UMUM"], "UMUM")).toEqual([]);
  });
  it("requires category, customers and finite amount", () => {
    expect(
      validatePricingForm({
        ...form,
        categoryId: "",
        unit: "",
        customerTypes: [],
        value: "Infinity",
      }),
    ).toMatchObject({
      categoryId: expect.any(String),
      customerTypes: expect.any(String),
      value: expect.any(String),
    });
    expect(validatePricingForm({ ...form, value: "" }).value).toBeTruthy();
    expect(validatePricingForm({ ...form, value: "0" }).value).toBeFalsy();
    expect(
      validatePricingForm({ ...form, mode: "PERCENT_DISCOUNT", value: "101" })
        .value,
    ).toBeTruthy();
    expect(
      validatePricingForm({ ...form, mode: "COST_PLUS_PERCENT", value: "101" }),
    ).toEqual({});
  });
  it.each(["COST_PLUS_FLAT", "COST_PLUS_PERCENT"] as const)("accepts all units for %s", (mode) => {
    expect(validatePricingForm({ ...form, mode, unit: "" })).toEqual({});
  });
  it.each(["pcs", "rim", "box"])("previews an all-unit formula for %s", (unit) => {
    const product = { id: `paper-${unit}`, name: "Kertas", unit, price: 5000, baseCostPrice: 700, baseCostUnit: "pcs", brandId: null };
    expect(previewPricingForm({ ...form, unit: "" }, product)).toEqual({ price: 4700, missingBaseCost: false });
    expect(previewPricingForm({ ...form, unit: "", mode: "COST_PLUS_PERCENT", value: "10" }, product)).toEqual({ price: 770, missingBaseCost: false });
  });
  it("previews base-unit modal directly in target unit, without conversion", () => {
    expect(
      previewPricingForm(form, {
        id: "paper-rim",
        name: "Kertas",
        unit: "rim",
        price: 5000,
        baseCostPrice: 700,
        baseCostUnit: "pcs",
        brandId: null,
      }),
    ).toEqual({ price: 4700, missingBaseCost: false });
    expect(
      previewPricingForm(
        { ...form, mode: "COST_PLUS_PERCENT", value: "10" },
        {
          id: "paper-rim",
          name: "Kertas",
          unit: "rim",
          price: 5000,
          baseCostPrice: 700,
          baseCostUnit: "pcs",
          brandId: null,
        },
      ).price,
    ).toBe(770);
  });
  it("explains missing base cost instead of displaying an applied formula", () => {
    expect(
      previewPricingForm(form, {
        id: "paper-rim",
        name: "Kertas",
        unit: "rim",
        price: 5000,
        baseCostPrice: null,
        baseCostUnit: null,
        brandId: null,
      }),
    ).toEqual({ price: 5000, missingBaseCost: true });
  });
});
