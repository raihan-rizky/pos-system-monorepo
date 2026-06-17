const DEFAULT_MULTIPLIER = 1;

export function normalizeUnitMultiplier(multiplier: number | null | undefined) {
  return Number.isFinite(multiplier) && Number(multiplier) > 0
    ? Number(multiplier)
    : DEFAULT_MULTIPLIER;
}

export function calculateDisplayStock(
  baseStock: number,
  unitMultiplierToBase: number | null | undefined,
) {
  return baseStock / normalizeUnitMultiplier(unitMultiplierToBase);
}

export function calculateBaseQuantity(
  displayQuantity: number,
  unitMultiplierToBase: number | null | undefined,
) {
  return displayQuantity * normalizeUnitMultiplier(unitMultiplierToBase);
}

export function resolveProductDisplayStock(product: {
  stock: number;
  unitMultiplierToBase?: number | null;
  stockGroup?: { baseStock: number } | null;
}) {
  if (!product.stockGroup) return product.stock;
  return calculateDisplayStock(
    product.stockGroup.baseStock,
    product.unitMultiplierToBase,
  );
}

export function withCalculatedStock<T extends {
  stock: number;
  unitMultiplierToBase?: number | null;
  stockGroup?: { baseStock: number } | null;
}>(product: T): T {
  if (!product.stockGroup) return product;
  return {
    ...product,
    stock: resolveProductDisplayStock(product),
  };
}

function formatQuantity(value: number) {
  if (Number.isInteger(value)) return String(value);
  return Number(value.toFixed(2)).toString();
}

export function formatCompoundStock(product: {
  stock: number;
  unit: string;
  unitMultiplierToBase?: number | null;
  stockGroup?: { baseUnit?: string | null } | null;
}) {
  const stock = Number(product.stock);
  if (!Number.isFinite(stock)) return `0 ${product.unit}`;

  const multiplier = normalizeUnitMultiplier(product.unitMultiplierToBase);
  const baseUnit = product.stockGroup?.baseUnit?.trim();
  if (
    !product.stockGroup ||
    multiplier <= 1 ||
    !baseUnit ||
    baseUnit.toLowerCase() === product.unit.trim().toLowerCase()
  ) {
    return `${formatQuantity(stock)} ${product.unit}`;
  }

  const sign = stock < 0 ? "-" : "";
  const absoluteStock = Math.abs(stock);
  const wholeUnits = Math.floor(absoluteStock);
  const baseRemainder = Math.floor((absoluteStock - wholeUnits) * multiplier + 1e-6);

  if (baseRemainder <= 0) {
    return `${sign}${wholeUnits} ${product.unit}`;
  }

  return `${sign}${wholeUnits} ${product.unit} ${baseRemainder} ${baseUnit}`;
}
