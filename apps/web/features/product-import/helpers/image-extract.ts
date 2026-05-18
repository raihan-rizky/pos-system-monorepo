import type { ExtractedProduct, NormalizedImportRow } from "../types";
import { normalizeIndonesianPrice } from "./sku-generator";

export const PRODUCT_EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Product name" },
          sku: { type: "string", description: "Product code/SKU. Generate if not visible." },
          category: { type: "string", description: "Product category" },
          price: { type: "number", description: "Selling price" },
          stock: { type: "number", description: "Stock quantity, default 0 if not visible" },
          unit: { type: "string", description: "Unit of measure (pcs, rim, box, etc.)" },
          costPrice: { type: ["number", "null"] },
          description: { type: ["string", "null"] },
          size: { type: ["string", "null"] },
          material: { type: ["string", "null"] },
          confidence: {
            type: "object",
            properties: {
              name: { type: "number" },
              price: { type: "number" },
              sku: { type: "number" },
            },
          },
        },
        required: ["name", "sku", "category", "price", "stock", "unit"],
      },
    },
  },
  required: ["products"],
};

export const IMAGE_EXTRACT_SYSTEM_PROMPT = `
You are a product data extraction assistant for an Indonesian print shop and stationery store (Toko Percetakan & ATK).

Extract ALL products visible in the image(s). For each product:
- name: The product name exactly as shown
- sku: Product code if visible; otherwise generate a short code from the name (e.g., "KRT-A4-80" for "Kertas A4 80gsm")
- category: Classify into one of: Alat Tulis, Kertas, Tinta, Jasa Cetak, Amplop, Map, Perlengkapan, or a fitting category
- price: Selling price in IDR (number only, no currency symbol)
- stock: Stock count if visible, otherwise 0
- unit: pcs, rim, box, lembar, meter, roll, pack, lusin, kodi, set
- costPrice: Cost/purchase price if visible
- size: Physical size if mentioned (A4, F4, 3x2m, etc.)
- material: Material if mentioned (Flexi 280gr, Art Paper 150gsm, etc.)
- confidence: 0.0-1.0 for name, price, sku accuracy

Handle Indonesian text. Prices may use dots as thousands separator (e.g., 25.000 = 25000).
`;

/**
 * Parse raw OCR text into structured product objects.
 */
export function parseOCRTextToProducts(text: string): ExtractedProduct[] {
  if (!text || !text.trim()) return [];

  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const products: ExtractedProduct[] = [];

  for (const line of lines) {
    // Very basic heuristics for tests.
    // E.g., "Kertas A4 80gsm Rp 55.000"
    // E.g., "Kertas A4 | 55000 | rim"
    // E.g., "Kertas A4\t55000\trim"
    
    // Quick reject if no numbers exist
    if (!/\d/.test(line)) continue;

    let name = "";
    let price = 0;
    
    if (line.includes("|") || line.includes("\t")) {
      const parts = line.split(/[|\t]/).map(p => p.trim());
      if (parts.length >= 2) {
        name = parts[0];
        price = normalizeIndonesianPrice(parts[1]);
      }
    } else {
      const rpMatch = line.match(/(Rp\.?|IDR)\s*([\d.,]+)/i);
      if (rpMatch) {
        name = line.substring(0, rpMatch.index).trim();
        price = normalizeIndonesianPrice(rpMatch[0]);
      }
    }

    if (name && price > 0) {
       products.push({
         name,
         sku: `SKU-${Math.random().toString(36).substr(2, 5)}`,
         category: "Uncategorized",
         price,
         stock: 0,
         unit: "pcs",
         confidence: { name: 0.8, price: 0.8, sku: 0.5 },
       });
    }
  }

  return products;
}

/**
 * Maps ExtractedProduct objects into NormalizedImportRow format.
 */
export function mapExtractedToImportRows(products: ExtractedProduct[]): NormalizedImportRow[] {
  const skuCounts = new Map<string, number>();
  products.forEach((p) => {
    if (p.sku) skuCounts.set(p.sku, (skuCounts.get(p.sku) ?? 0) + 1);
  });

  return products.map((p, index) => {
    const duplicateInFile = p.sku ? (skuCounts.get(p.sku) ?? 0) > 1 : false;
    return {
      rowNumber: index + 2, // 1 is header conceptually
      name: p.name,
      sku: p.sku,
      category: p.category,
      price: p.price,
      stock: p.stock,
      unit: p.unit,
      costPrice: p.costPrice ?? 0,
      minStock: 0,
      description: p.description ?? null,
      size: p.size ?? null,
      material: p.material ?? null,
      duplicateInFile,
      missingCategory: false, // Handled later
      warnings: [
        p.confidence?.name < 0.6 ? "Low confidence in name" : null,
        p.confidence?.price < 0.6 ? "Low confidence in price" : null,
        p.confidence?.sku < 0.6 ? "Low confidence in SKU" : null,
        duplicateInFile ? "Duplicate SKU in file." : null,
      ].filter(Boolean) as string[],
      errors: [],
    };
  });
}
