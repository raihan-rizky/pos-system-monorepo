export type StockWarningType = "minus" | "low" | null;

export interface StockWarningInfo {
  type: StockWarningType;
  message: string;
  severity: "critical" | "warning";
}

export function isMinusStock(stock: number): boolean {
  return stock < 0;
}

export function isBelowMinStock(stock: number, minStock: number): boolean {
  return stock <= minStock && stock >= 0;
}

export function hasStockWarning(stock: number, minStock: number): boolean {
  return isMinusStock(stock) || isBelowMinStock(stock, minStock);
}

export function getStockWarningType(stock: number, minStock: number): StockWarningType {
  if (isMinusStock(stock)) return "minus";
  if (isBelowMinStock(stock, minStock)) return "low";
  return null;
}

export function getStockWarningInfo(stock: number, minStock: number, productName: string): StockWarningInfo | null {
  const type = getStockWarningType(stock, minStock);
  
  if (type === "minus") {
    return {
      type,
      message: `${productName} has negative stock (${stock} units). This may indicate an inventory discrepancy that needs attention.`,
      severity: "critical",
    };
  }
  
  if (type === "low") {
    return {
      type,
      message: `${productName} is below minimum stock level. Current: ${stock} units, Minimum: ${minStock} units.`,
      severity: "warning",
    };
  }
  
  return null;
}

export function countProductsWithMinusStock(products: Array<{ stock: number }>): number {
  return products.filter(p => isMinusStock(p.stock)).length;
}

export function countProductsWithWarnings(products: Array<{ stock: number; minStock: number }>): number {
  return products.filter(p => hasStockWarning(p.stock, p.minStock)).length;
}
