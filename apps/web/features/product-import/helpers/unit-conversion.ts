export type ImportUnitMultiplierSource = "provided" | "guessed" | "same-unit" | "unknown";

export interface ImportUnitMultiplierResult {
  multiplier: number;
  conversionNeedsReview: boolean;
  source: ImportUnitMultiplierSource;
}

const CONSERVATIVE_MULTIPLIERS = new Map<string, number>([
  ["rim", 500],
  ["lusin", 12],
  ["kodi", 20],
]);

function normalizeUnit(value: string): string {
  return value.trim().toLowerCase();
}

export function resolveImportUnitMultiplier(input: {
  unit: string;
  baseUnit: string;
  providedMultiplier?: number | null;
}): ImportUnitMultiplierResult {
  if (input.providedMultiplier && Number.isFinite(input.providedMultiplier) && input.providedMultiplier > 0) {
    return {
      multiplier: input.providedMultiplier,
      conversionNeedsReview: false,
      source: "provided",
    };
  }

  const unit = normalizeUnit(input.unit);
  const baseUnit = normalizeUnit(input.baseUnit);
  if (unit === baseUnit) {
    return { multiplier: 1, conversionNeedsReview: false, source: "same-unit" };
  }

  const guessed = CONSERVATIVE_MULTIPLIERS.get(unit);
  if (guessed) {
    return { multiplier: guessed, conversionNeedsReview: false, source: "guessed" };
  }

  return { multiplier: 1, conversionNeedsReview: true, source: "unknown" };
}
