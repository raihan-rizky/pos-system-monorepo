import { describe, it, expect } from "vitest";
import {
  parseOCRTextToProducts,
  mapExtractedToImportRows,
  PRODUCT_EXTRACTION_SCHEMA,
  IMAGE_EXTRACT_SYSTEM_PROMPT,
} from "../image-extract";
import type { ExtractedProduct } from "../../types";

describe("PRODUCT_EXTRACTION_SCHEMA", () => {
  it("is a valid JSON schema object", () => {
    expect(PRODUCT_EXTRACTION_SCHEMA).toBeDefined();
    expect(PRODUCT_EXTRACTION_SCHEMA.type).toBe("object");
    expect(PRODUCT_EXTRACTION_SCHEMA.properties).toHaveProperty("products");
  });

  it("requires products array with required fields", () => {
    const items = PRODUCT_EXTRACTION_SCHEMA.properties.products.items;
    expect(items.required).toContain("name");
    expect(items.required).toContain("sku");
    expect(items.required).toContain("price");
    expect(items.required).toContain("category");
    expect(items.required).toContain("stock");
    expect(items.required).toContain("unit");
  });
});

describe("IMAGE_EXTRACT_SYSTEM_PROMPT", () => {
  it("contains Indonesian context", () => {
    expect(IMAGE_EXTRACT_SYSTEM_PROMPT).toContain("Indonesian");
  });

  it("mentions product extraction", () => {
    expect(IMAGE_EXTRACT_SYSTEM_PROMPT.toLowerCase()).toContain("extract");
  });

  it("mentions confidence scores", () => {
    expect(IMAGE_EXTRACT_SYSTEM_PROMPT.toLowerCase()).toContain("confidence");
  });
});

describe("parseOCRTextToProducts", () => {
  it("returns empty array for empty text", () => {
    expect(parseOCRTextToProducts("")).toEqual([]);
    expect(parseOCRTextToProducts("   ")).toEqual([]);
  });

  it("returns empty array for non-product text", () => {
    const text = "Hello this is just a random sentence without any products";
    expect(parseOCRTextToProducts(text)).toEqual([]);
  });

  it("extracts products from price-list format lines", () => {
    const text = `Kertas A4 80gsm Rp 55.000
Tinta Epson L3150 Rp 89.000
Amplop Putih A4 Rp 12.000`;
    const products = parseOCRTextToProducts(text);
    expect(products.length).toBe(3);
    expect(products[0].name).toContain("Kertas");
    expect(products[0].price).toBe(55000);
    expect(products[1].price).toBe(89000);
    expect(products[2].price).toBe(12000);
  });

  it("extracts products from pipe-delimited format", () => {
    const text = `Kertas A4 | 55000 | rim
Tinta Epson | 89000 | pcs`;
    const products = parseOCRTextToProducts(text);
    expect(products.length).toBe(2);
    expect(products[0].name).toContain("Kertas");
    expect(products[0].price).toBe(55000);
    expect(products[1].name).toContain("Tinta");
  });

  it("extracts products from tab-delimited format", () => {
    const text = "Kertas A4\t55000\trim\nTinta Epson\t89000\tpcs";
    const products = parseOCRTextToProducts(text);
    expect(products.length).toBe(2);
  });

  it("handles Rp and IDR prefixes in OCR text", () => {
    const text = "Kertas HVS A4 Rp. 55.000\nTinta Canon IDR 120.000";
    const products = parseOCRTextToProducts(text);
    expect(products.length).toBe(2);
    expect(products[0].price).toBe(55000);
    expect(products[1].price).toBe(120000);
  });

  it("generates confidence scores for each product", () => {
    const text = "Kertas A4 80gsm Rp 55.000";
    const products = parseOCRTextToProducts(text);
    expect(products.length).toBe(1);
    expect(products[0].confidence).toBeDefined();
    expect(products[0].confidence.name).toBeGreaterThan(0);
    expect(products[0].confidence.price).toBeGreaterThan(0);
  });
});

describe("mapExtractedToImportRows", () => {
  const sampleProducts: ExtractedProduct[] = [
    {
      name: "Kertas A4 80gsm",
      sku: "KRT-A4-80",
      category: "Kertas",
      price: 55000,
      stock: 10,
      unit: "rim",
      costPrice: null,
      description: null,
      size: "A4",
      material: "80gsm",
      confidence: { name: 0.95, price: 0.9, sku: 0.7 },
    },
    {
      name: "Tinta Epson L3150",
      sku: "TNT-EPS",
      category: "Tinta",
      price: 89000,
      stock: 0,
      unit: "pcs",
      costPrice: 75000,
      description: null,
      size: null,
      material: null,
      confidence: { name: 0.85, price: 0.95, sku: 0.6 },
    },
  ];

  it("converts extracted products to NormalizedImportRow format", () => {
    const rows = mapExtractedToImportRows(sampleProducts);
    expect(rows.length).toBe(2);
    expect(rows[0].name).toBe("Kertas A4 80gsm");
    expect(rows[0].sku).toBe("KRT-A4-80");
    expect(rows[0].category).toBe("Kertas");
    expect(rows[0].price).toBe(55000);
    expect(rows[0].stock).toBe(10);
    expect(rows[0].unit).toBe("rim");
  });

  it("maps optional fields when present", () => {
    const rows = mapExtractedToImportRows(sampleProducts);
    expect(rows[1].costPrice).toBe(75000);
  });

  it("returns empty array for empty input", () => {
    expect(mapExtractedToImportRows([])).toEqual([]);
  });

  it("sets default values for missing optional fields", () => {
    const products: ExtractedProduct[] = [
      {
        name: "Test",
        sku: "T-1",
        category: "Cat",
        price: 1000,
        stock: 0,
        unit: "pcs",
        confidence: { name: 1, price: 1, sku: 1 },
      },
    ];
    const rows = mapExtractedToImportRows(products);
    expect(rows[0].costPrice).toBe(0);
  });
});
