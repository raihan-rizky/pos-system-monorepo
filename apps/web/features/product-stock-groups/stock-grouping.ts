export interface StockGroupKeyInput {
  name: string;
  categoryId: string;
  material?: string | null;
  size?: string | null;
}

function normalizePart(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeStockGroupKey(input: StockGroupKeyInput): string {
  return [
    normalizePart(input.name),
    (input.categoryId ?? "").trim(),
    normalizePart(input.material),
    normalizePart(input.size),
  ].join("|");
}

export function hasMeaningfulGroupingAttributes(input: StockGroupKeyInput) {
  return Boolean(normalizePart(input.name) && input.categoryId.trim());
}
