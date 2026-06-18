function normalizeSkuPart(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function generateVariantSku(
  sourceSku: string,
  unit: string,
  existingSkus: Set<string>,
): string {
  const source = normalizeSkuPart(sourceSku) || "SKU";
  const suffix = normalizeSkuPart(unit) || "UNIT";
  const base = `${source}-${suffix}`.slice(0, 48);

  if (!existingSkus.has(base)) return base;

  let index = 2;
  let candidate = `${base}-${index}`;
  while (existingSkus.has(candidate)) {
    index += 1;
    candidate = `${base}-${index}`;
  }

  return candidate;
}
