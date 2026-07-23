const LARGE_PURCHASE_UNITS = new Set([
  "dus",
  "box",
  "pak",
  "pack",
  "krat",
  "karton",
  "bal",
  "sak",
]);

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildGoodsPurchaseNumber(
  date: Date,
  sequence: number,
): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `PB-${year}${month}-${String(sequence).padStart(3, "0")}`;
}

export function calculateGoodsPurchaseLineTotal(
  quantity: number,
  latestUnitPrice: number,
): number {
  return roundMoney(quantity * latestUnitPrice);
}

export function calculateGoodsPurchaseTotal(
  items: Array<{ quantity: number; latestUnitPrice: number }>,
): number {
  return roundMoney(
    items.reduce(
      (sum, item) =>
        sum +
        calculateGoodsPurchaseLineTotal(
          item.quantity,
          item.latestUnitPrice,
        ),
      0,
    ),
  );
}

export function hasMasterHppDifference(
  masterHpp: number | null,
  latestPrice: number,
): boolean {
  return masterHpp === null || roundMoney(masterHpp) !== roundMoney(latestPrice);
}

export function isLargePurchaseUnit(input: {
  unit: string | null;
  unitMultiplierToBase: number;
}): boolean {
  const normalizedUnit =
    input.unit?.trim().toLocaleLowerCase("id-ID") ?? "";
  return (
    input.unitMultiplierToBase > 1 ||
    LARGE_PURCHASE_UNITS.has(normalizedUnit)
  );
}

export function countPendingGoodsPurchaseItems(
  items: Array<{ reviewStatus: "PENDING" | "APPROVED" }>,
): number {
  return items.filter((item) => item.reviewStatus === "PENDING").length;
}
