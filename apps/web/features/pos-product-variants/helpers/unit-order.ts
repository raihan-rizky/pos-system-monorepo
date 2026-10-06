export function orderUnits<
  T extends {
    id: string;
    unit: string;
    unitMultiplierToBase?: number | null;
  },
>(variants: readonly T[], baseUnit?: string | null): T[] {
  const factor = (variant: T): number => {
    const multiplier = variant.unitMultiplierToBase;
    if (
      typeof multiplier === "number" &&
      Number.isFinite(multiplier) &&
      multiplier > 0
    ) {
      return multiplier;
    }
    return baseUnit && variant.unit.toLowerCase() === baseUnit.toLowerCase()
      ? 1
      : Number.POSITIVE_INFINITY;
  };

  return [...variants].sort((left, right) => {
    const leftFactor = factor(left);
    const rightFactor = factor(right);
    return (
      (leftFactor === rightFactor ? 0 : leftFactor < rightFactor ? -1 : 1) ||
      left.unit.localeCompare(right.unit, "id") ||
      left.id.localeCompare(right.id)
    );
  });
}
