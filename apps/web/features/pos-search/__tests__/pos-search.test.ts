import { describe, it, expect } from "vitest";
import {
  parseSearchQuery,
  matchesSearchTokens,
  buildProductSearchOR,
} from "../pos-search";

describe("parseSearchQuery", () => {
  it("returns empty array for empty / whitespace input", () => {
    expect(parseSearchQuery("")).toEqual([]);
    expect(parseSearchQuery("   ")).toEqual([]);
    expect(parseSearchQuery(undefined)).toEqual([]);
  });

  it("splits on whitespace and lowercases tokens", () => {
    expect(parseSearchQuery("Coca Cola")).toEqual(["coca", "cola"]);
    expect(parseSearchQuery("  Indomie   GORENG ")).toEqual([
      "indomie",
      "goreng",
    ]);
  });

  it("keeps a quoted phrase as a single token", () => {
    expect(parseSearchQuery('"coca cola" zero')).toEqual([
      "coca cola",
      "zero",
    ]);
  });

  it("deduplicates repeated tokens", () => {
    expect(parseSearchQuery("abc abc ABC")).toEqual(["abc"]);
  });

  it("caps to a maximum of 8 tokens to avoid pathological queries", () => {
    const input = Array.from({ length: 20 }, (_, i) => `t${i}`).join(" ");
    expect(parseSearchQuery(input)).toHaveLength(8);
  });
});

describe("matchesSearchTokens", () => {
  const product = {
    name: "Indomie Goreng Spesial",
    sku: "IDM-001",
    barcode: "8991002101814",
  };

  it("matches when all tokens appear across name/sku/barcode (AND semantics)", () => {
    expect(matchesSearchTokens(product, ["indomie", "goreng"])).toBe(true);
    expect(matchesSearchTokens(product, ["goreng", "idm"])).toBe(true);
  });

  it("does not match when any token is missing", () => {
    expect(matchesSearchTokens(product, ["indomie", "sambal"])).toBe(false);
  });

  it("matches barcode prefix even when only a fragment is provided", () => {
    expect(matchesSearchTokens(product, ["899100"])).toBe(true);
  });

  it("is case insensitive", () => {
    expect(matchesSearchTokens(product, ["INDOMIE"])).toBe(true);
  });

  it("returns true with empty tokens (no filter)", () => {
    expect(matchesSearchTokens(product, [])).toBe(true);
  });

  it("handles missing optional fields safely", () => {
    expect(
      matchesSearchTokens({ name: "Air Mineral", sku: "AM-1" }, ["air"]),
    ).toBe(true);
  });

  it("matches category and brand names so category searches find existing products", () => {
    expect(
      matchesSearchTokens(
        {
          name: "A4 70gsm",
          sku: "A4-70-RIM",
          category: { name: "Kertas" },
        },
        ["kertas"],
      ),
    ).toBe(true);
    expect(
      matchesSearchTokens(
        {
          name: "Ballpoint Standard",
          sku: "PEN-STD",
          brand: { name: "Joyko" },
        },
        ["joyko"],
      ),
    ).toBe(true);
  });
});

describe("buildProductSearchOR", () => {
  it("returns undefined for empty tokens so callers can omit the filter", () => {
    expect(buildProductSearchOR([])).toBeUndefined();
  });

  it("emits AND of OR groups so each token must hit some field", () => {
    const where = buildProductSearchOR(["indomie", "goreng"]);
    expect(where?.AND).toHaveLength(2);
    expect(where?.AND[0].OR).toEqual(
      expect.arrayContaining([
        { name: { contains: "indomie", mode: "insensitive" } },
        { sku: { contains: "indomie", mode: "insensitive" } },
        { barcode: { contains: "indomie", mode: "insensitive" } },
        { category: { is: { name: { contains: "indomie", mode: "insensitive" } } } },
        { brand: { is: { name: { contains: "indomie", mode: "insensitive" } } } },
      ]),
    );
    expect(where?.AND[1].OR).toEqual(
      expect.arrayContaining([
        { name: { contains: "goreng", mode: "insensitive" } },
        { sku: { contains: "goreng", mode: "insensitive" } },
        { barcode: { contains: "goreng", mode: "insensitive" } },
        { category: { is: { name: { contains: "goreng", mode: "insensitive" } } } },
        { brand: { is: { name: { contains: "goreng", mode: "insensitive" } } } },
      ]),
    );
  });

  it("includes category and brand names in every token search group", () => {
    const where = buildProductSearchOR(["kertas"]);

    expect(where?.AND[0].OR).toEqual(
      expect.arrayContaining([
        { category: { is: { name: { contains: "kertas", mode: "insensitive" } } } },
        { brand: { is: { name: { contains: "kertas", mode: "insensitive" } } } },
      ]),
    );
  });
});
