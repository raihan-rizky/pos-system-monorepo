import { describe, expect, it } from "vitest";
import {
  buildGroupCreationPreview,
  rebaseCreationQuantities,
} from "../group-creation-preview";
import type { StockGroupDetail } from "../api/stock-group-api";
const products = [
  { id: "pcs", name: "Kertas", sku: "P", unit: "pcs", stock: 24 },
  { id: "dus", name: "Kertas dus", sku: "D", unit: "dus", stock: 8 },
];
const target: StockGroupDetail = {
  id: "g",
  displayName: "Grup lama",
  baseUnit: "lembar",
  baseStock: 100,
  hasNegativeStock: false,
  variants: [
    {
      id: "lembar",
      name: "Lembar",
      sku: "L",
      unit: "lembar",
      stock: 100,
      unitMultiplierToBase: 1,
      conversionNeedsReview: false,
      price: 1,
    },
    {
      id: "rim",
      name: "Rim",
      sku: "R",
      unit: "rim",
      stock: 2,
      unitMultiplierToBase: 50,
      conversionNeedsReview: false,
      price: 1,
    },
  ],
};
describe("group creation preview", () => {
  it("uses only the chosen source stock, never the sum", () => {
    const result = buildGroupCreationPreview({
      products,
      sourceProductId: "pcs",
      quantities: { dus: "12" },
    });
    expect(result.errors).toEqual({});
    expect(result.baseStock).toBe(24);
    expect(result.rows.map((row) => [row.id, row.before, row.after])).toEqual([
      ["pcs", 24, 24],
      ["dus", 8, 2],
    ]);
  });
  it.each(["", "0", "-1", "Infinity", "NaN"])(
    "blocks invalid quantity %s",
    (quantity) => {
      const result = buildGroupCreationPreview({
        products,
        sourceProductId: "pcs",
        quantities: { dus: quantity },
      });
      expect(result.errors.dus).toContain("lebih dari 0");
      expect(result.rows).toEqual([]);
    },
  );
  it("flags both members of a duplicate unit including the destination", () => {
    const result = buildGroupCreationPreview({
      products: [
        ...products,
        {
          id: "new",
          name: "Lembar baru",
          sku: "N",
          unit: " LEMBAR ",
          stock: 0,
        },
      ],
      target,
      sourceProductId: "pcs",
      quantities: {},
    });
    expect(result.errors.new).toContain("Satuan");
    expect(result.errors.lembar).toContain("Satuan");
  });
  it("includes target members and matches the joining endpoint's persisted multipliers", () => {
    const result = buildGroupCreationPreview({
      products,
      target,
      sourceProductId: "lembar",
      quantities: { pcs: "1", dus: "12", rim: "50" },
    });
    expect(result.errors).toEqual({});
    expect(result.baseUnit).toBe("lembar");
    expect(result.rows.find((row) => row.id === "rim")).toMatchObject({
      before: 2,
      after: 2,
    });
    expect(result.conversionPairs).toHaveLength(3);
  });
  it("blocks an incoming source that would normalize existing stock to another unit", () => {
    const result = buildGroupCreationPreview({
      products,
      target,
      sourceProductId: "pcs",
      quantities: { dus: "12" },
    });
    expect(result.rows).toEqual([]);
    expect(result.errors.group).toContain("Satuan acuan");
  });
  it("rebases every quantity when source changes", () => {
    const quantities = rebaseCreationQuantities(products, "pcs", "dus", {
      dus: "12",
    });
    expect(Number(quantities.pcs)).toBeCloseTo(1 / 12);
    const result = buildGroupCreationPreview({
      products,
      sourceProductId: "dus",
      quantities,
    });
    expect(result.rows.find((row) => row.id === "pcs")?.after).toBe(96);
    expect(result.baseStock).toBe(8);
  });
  it("clears values whose new source relationship is unknown", () => {
    expect(
      rebaseCreationQuantities(products, "pcs", "dus", { dus: "" }),
    ).toEqual({ pcs: "" });
  });
  it("blocks a legacy destination without a valid active base member", () => {
    const result = buildGroupCreationPreview({
      products, target: { ...target, variants: target.variants.slice(1) },
      sourceProductId: "rim", quantities: { pcs: "1", dus: "12" },
    });
    expect(result.errors.group).toContain("Tinjau Satuan");
    expect(result.rows).toEqual([]);
  });
  it("uses current target detail when an already selected member has stale stock", () => {
    const result = buildGroupCreationPreview({
      products: [{ ...target.variants[0], stock: 5 }, products[1]], target,
      sourceProductId: "lembar", quantities: { dus: "12" },
    });
    expect(result.baseStock).toBe(100);
    expect(result.rows.find(row => row.id === "lembar")).toMatchObject({ before: 100, after: 100 });
    expect(result.rows.find(row => row.id === "rim")).toMatchObject({ before: 2, after: 2 });
  });
});
