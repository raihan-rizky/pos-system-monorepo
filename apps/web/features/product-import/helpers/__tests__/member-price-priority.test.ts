import { describe, expect, it } from "vitest";
import { normalizeImportRows } from "../import-core";
import { resolveProductImportAutoDecisions } from "../auto-decisions";
import { priceProductForCustomerType } from "@/features/customer-category-pricing/helpers/pricing-rules";

const baseRow = { name: "Kertas HVS", sku: "HVS", category: "Kertas", unit: "rim", price: 15000 };

describe.each([false, true])("imported member prices with Harga Khusus enabled: %s", (enabled) => {
  it.each([
    { prices: { hargaAgen: 10000, hargaDinas: 20000 }, agen: 10000, dinas: 20000 },
    { prices: { hargaAgen: 10000, hargaDinas: 0 }, agen: 10000, dinas: 15000 },
    { prices: { hargaAgen: 0, hargaDinas: 20000 }, agen: 15000, dinas: 20000 },
    { prices: { hargaAgen: 0, hargaDinas: 0 }, agen: 15000, dinas: 15000 },
    { prices: { hargaAgen: "", hargaDinas: "" }, agen: 15000, dinas: 15000 },
    { prices: {}, agen: 15000, dinas: 15000 },
  ])("prices imported $prices independently as Agen $agen and Dinas $dinas", ({ prices, agen, dinas }) => {
    const { rows } = normalizeImportRows([{ ...baseRow, ...prices }], new Map(), new Set(["kertas"]));
    const product = { ...rows[0], categoryId: "paper" };

    expect(priceProductForCustomerType(product, "AGEN", [], "SPECIAL", enabled).unitPrice).toBe(agen);
    expect(priceProductForCustomerType(product, "PEMERINTAH", [], "SPECIAL", enabled).unitPrice).toBe(dinas);
    expect(priceProductForCustomerType(product, "UMUM", [], "SPECIAL", enabled).unitPrice).toBe(15000);
  });
});

describe("existing import member price fallback planning", () => {
  it.each([
    { label: "absent columns", prices: {} },
    { label: "blank values", prices: { hargaAgen: "", hargaDinas: "" } },
    { label: "zero values", prices: { hargaAgen: 0, hargaDinas: 0 } },
    { label: "only Agen supplied", prices: { hargaAgen: 10000 } },
    { label: "only Dinas supplied", prices: { hargaDinas: 20000 } },
  ])("updates existing overrides for $label even when the selling price is unchanged", ({ prices }) => {
    const { rows } = normalizeImportRows([{ ...baseRow, costPrice: 8000, ...prices }], new Map(), new Set(["kertas"]));
    const [resolved] = resolveProductImportAutoDecisions({
      rows,
      existingProducts: [{
        id: "hvs", ...baseRow, costPrice: 8000,
        hargaAgen: 10000, hargaDinas: 20000,
      }],
      existingSkus: new Set(["HVS"]),
    });

    expect(resolved.autoAction).toBe("auto_price_update");
    expect(resolved.matchedProductId).toBe("hvs");
    if (!("hargaAgen" in prices)) expect(resolved.hargaAgenProvided).toBe(false);
    if (!("hargaDinas" in prices)) expect(resolved.hargaDinasProvided).toBe(false);
  });
});
