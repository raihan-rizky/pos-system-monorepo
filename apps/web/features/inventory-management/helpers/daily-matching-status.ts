export type DailyMatchingRowStatus =
  | "unchecked"
  | "matched"
  | "different"
  | "invalid";

export interface DailyMatchingRowStatusInput {
  expectedStock: number;
  physicalStockInput: string | undefined;
  isChecked: boolean;
}

export interface DailyMatchingStatusSummary {
  checkedCount: number;
  matchedCount: number;
  differentCount: number;
  invalidCount: number;
  canSubmit: boolean;
}

export function parseDailyMatchingStockInput(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

export function getDailyMatchingRowStatus(
  input: DailyMatchingRowStatusInput,
): DailyMatchingRowStatus {
  if (!input.isChecked) return "unchecked";

  const physicalStock = parseDailyMatchingStockInput(input.physicalStockInput);
  if (physicalStock === null) return "invalid";

  return Math.abs(physicalStock - input.expectedStock) <= 1e-9
    ? "matched"
    : "different";
}

export function summarizeDailyMatchingStatuses(
  statuses: readonly DailyMatchingRowStatus[],
): DailyMatchingStatusSummary {
  const matchedCount = statuses.filter((status) => status === "matched").length;
  const differentCount = statuses.filter((status) => status === "different").length;
  const invalidCount = statuses.filter((status) => status === "invalid").length;

  return {
    checkedCount: matchedCount + differentCount + invalidCount,
    matchedCount,
    differentCount,
    invalidCount,
    canSubmit: invalidCount === 0,
  };
}
