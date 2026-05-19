import { describe, it, expect } from "vitest";
import { Product } from "@/hooks/useProducts";

// Helper functions to test
export function isMinusStock(product: Product): boolean {
  return product.stock < 0;
}

export function isBelowMinStock(product: Product): boolean {
  return product.stock <= product.minStock && product.stock >= 0;
}

export function hasStockWarning(product: Product): boolean {
  return isMinusStock(product) || isBelowMinStock(product);
}

export function getStockWarningType(product: Product): "minus" | "low" | null {
  if (isMinusStock(product)) return "minus";
  if (isBelowMinStock(product)) return "low";
  return null;
}

export function countProductsWithMinusStock(products: Product[]): number {
  return products.filter(isMinusStock).length;
}

export function countProductsWithWarnings(products: Product[]): number {
  return products.filter(hasStockWarning).length;
}

describe("Stock Warning Detection", () => {
  const mockProduct = (stock: number, minStock: number = 5): Product => ({
    id: "test-1",
    name: "Test Product",
    sku: "TEST-001",
    price: 10000,
    costPrice: null,
    stock,
    minStock,
    unit: "pcs",
    size: null,
    material: null,
    imageUrl: null,
    isActive: true,
    category: { id: "cat-1", name: "Test", icon: null, color: null },
  });

  describe("isMinusStock", () => {
    it("should return true for negative stock", () => {
      expect(isMinusStock(mockProduct(-5))).toBe(true);
      expect(isMinusStock(mockProduct(-1))).toBe(true);
    });

    it("should return false for zero or positive stock", () => {
      expect(isMinusStock(mockProduct(0))).toBe(false);
      expect(isMinusStock(mockProduct(5))).toBe(false);
      expect(isMinusStock(mockProduct(100))).toBe(false);
    });
  });

  describe("isBelowMinStock", () => {
    it("should return true when stock is at or below minStock", () => {
      expect(isBelowMinStock(mockProduct(5, 5))).toBe(true);
      expect(isBelowMinStock(mockProduct(3, 5))).toBe(true);
      expect(isBelowMinStock(mockProduct(0, 5))).toBe(true);
    });

    it("should return false when stock is above minStock", () => {
      expect(isBelowMinStock(mockProduct(6, 5))).toBe(false);
      expect(isBelowMinStock(mockProduct(10, 5))).toBe(false);
    });

    it("should return false for negative stock", () => {
      expect(isBelowMinStock(mockProduct(-1, 5))).toBe(false);
    });
  });

  describe("hasStockWarning", () => {
    it("should return true for minus stock", () => {
      expect(hasStockWarning(mockProduct(-5))).toBe(true);
    });

    it("should return true for low stock", () => {
      expect(hasStockWarning(mockProduct(3, 5))).toBe(true);
    });

    it("should return false for healthy stock", () => {
      expect(hasStockWarning(mockProduct(10, 5))).toBe(false);
    });
  });

  describe("getStockWarningType", () => {
    it("should return 'minus' for negative stock", () => {
      expect(getStockWarningType(mockProduct(-5))).toBe("minus");
    });

    it("should return 'low' for below minStock", () => {
      expect(getStockWarningType(mockProduct(3, 5))).toBe("low");
    });

    it("should return null for healthy stock", () => {
      expect(getStockWarningType(mockProduct(10, 5))).toBeNull();
    });
  });

  describe("countProductsWithMinusStock", () => {
    it("should count products with negative stock", () => {
      const products = [
        mockProduct(-5),
        mockProduct(-1),
        mockProduct(0),
        mockProduct(10),
      ];
      expect(countProductsWithMinusStock(products)).toBe(2);
    });

    it("should return 0 when no products have minus stock", () => {
      const products = [mockProduct(0), mockProduct(5), mockProduct(10)];
      expect(countProductsWithMinusStock(products)).toBe(0);
    });
  });

  describe("countProductsWithWarnings", () => {
    it("should count all products with warnings", () => {
      const products = [
        mockProduct(-5),
        mockProduct(3, 5),
        mockProduct(10, 5),
      ];
      expect(countProductsWithWarnings(products)).toBe(2);
    });
  });
});
