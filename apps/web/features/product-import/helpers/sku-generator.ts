/**
 * Auto-generate a SKU from product name and category.
 *
 * Examples:
 *   ("Kertas A4 80gsm", "Kertas")  → "KRT-A4-80GSM"
 *   ("Tinta Epson L3150", "Tinta") → "TNT-EPS-L3150"
 */
export function generateSku(name: string, category: string): string {
  const catPrefix = category
    .replace(/[^a-zA-Z]/g, "")
    .slice(0, 3)
    .toUpperCase();

  const tokens = name
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) {
    return catPrefix || "SKU";
  }

  // Skip the first token if it matches the category prefix (avoid duplication)
  const catNorm = category.toLowerCase().replace(/[^a-z]/g, "");
  const startIndex = tokens[0].toLowerCase().replace(/[^a-z]/g, "") === catNorm ? 1 : 0;

  const skuParts = tokens.slice(startIndex, startIndex + 3).map((token) => {
    const upper = token.toUpperCase();
    // If token is mostly alpha (word), take first 3 chars
    if (/^[A-Z]+$/i.test(token)) {
      return upper.slice(0, 3);
    }
    // If token contains digits, keep it as-is (model numbers, sizes)
    return upper;
  });

  const parts = [catPrefix, ...skuParts].filter(Boolean);
  return parts.join("-").slice(0, 20);
}

/**
 * Normalize Indonesian price formats to a plain number.
 *
 * Handles:
 *   "25.000"        → 25000
 *   "Rp 55.000"     → 55000
 *   "Rp. 125.000"   → 125000
 *   "IDR 1.500.000" → 1500000
 *   "25.000,50"     → 25000.5
 *   25000           → 25000
 */
export function normalizeIndonesianPrice(value: string | number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  // Strip currency prefixes and whitespace
  let cleaned = value.trim().replace(/^(Rp\.?\s*|IDR\s*)/i, "").trim();

  if (!cleaned) return 0;

  // Indonesian format: dots as thousands, comma as decimal
  // e.g., "1.500.000,50" → "1500000.50"
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    // Pure dot-separated thousands without decimal
    cleaned = cleaned.replace(/\./g, "");
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? num : 0;
}
