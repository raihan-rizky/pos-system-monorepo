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
  it("requires category, customers, target unit and finite amount", () => {
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
      unit: expect.any(String),
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
