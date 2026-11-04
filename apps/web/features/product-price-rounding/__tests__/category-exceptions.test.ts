import { describe, expect, it } from "vitest";
import { roundSellingPrice, roundSellingPriceLine, validatePriceRoundingSettings } from "../rounding";

describe("kategori yang dikecualikan dari pembulatan", () => {
  it("mempertahankan kategori yang dipilih saat memvalidasi pengaturan", () => {
    const settings = {
      enabled: true,
      increment: 500,
      threshold: 50,
      excludedCategoryIds: ["kertas", "tinta"],
    };

    expect(validatePriceRoundingSettings(settings)).toEqual(settings);
  });

  it("menghapus duplikasi kategori yang dipilih", () => {
    const settings = {
      enabled: true,
      increment: 500,
      threshold: 50,
      excludedCategoryIds: ["kertas", "tinta", "kertas"],
    };

    expect(validatePriceRoundingSettings(settings).excludedCategoryIds).toEqual(["kertas", "tinta"]);
  });

  it("menolak identitas kategori kosong", () => {
    expect(() => validatePriceRoundingSettings({
      enabled: true,
      increment: 500,
      threshold: 50,
      excludedCategoryIds: [""],
    })).toThrow();
  });

  it("tidak membulatkan harga produk dari kategori yang dikecualikan", () => {
    const settings = { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: ["kertas", "tinta"] };
    expect(roundSellingPrice(4050, settings, "kertas")).toEqual({
      originalPrice: 4050, roundedPrice: 4050, direction: "NONE", difference: 0,
    });
    expect(roundSellingPrice(4050, settings, "lainnya").roundedPrice).toBe(4500);
  });

  it("tidak menambahkan metadata pembulatan pada baris yang dikecualikan", () => {
    const settings = { enabled: true, increment: 500, threshold: 50, excludedCategoryIds: ["kertas"] };
    const result = roundSellingPriceLine({ unitPrice: 4050, appliedPricing: { appliedUnitPrice: 4050 } }, settings, "kertas");
    expect(result.unitPrice).toBe(4050);
    expect(result.appliedPricing?.appliedUnitPrice).toBe(4050);
    expect(result.priceRounding).toBeNull();
  });
});
