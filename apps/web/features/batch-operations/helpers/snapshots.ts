import type { Product } from "@pos/db";

export interface ProductSnapshot {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  price: number;
  costPrice: number | null;
  hargaDinas: number | null;
  stock: number;
  minStock: number;
  unit: string;
  size: string | null;
  material: string | null;
  categoryId: string;
  storeId: string;
  isActive: boolean;
  imageUrl: string | null;
}

export function productSnapshot(product: Product): ProductSnapshot {
  return {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    description: product.description,
    price: Number(product.price),
    costPrice: product.costPrice === null ? null : Number(product.costPrice),
    hargaDinas: product.hargaDinas === null ? null : Number(product.hargaDinas),
    stock: product.stock,
    minStock: product.minStock,
    unit: product.unit,
    size: product.size,
    material: product.material,
    categoryId: product.categoryId,
    storeId: product.storeId,
    isActive: product.isActive,
    imageUrl: product.imageUrl,
  };
}

export function snapshotsMatch(current: ProductSnapshot, expected: ProductSnapshot) {
  return JSON.stringify(current) === JSON.stringify(expected);
}

export function stockDelta(type: "IN" | "OUT" | "ADJUSTMENT", currentStock: number, quantity: number) {
  if (type === "IN") return Math.abs(quantity);
  if (type === "OUT") return -Math.abs(quantity);
  return quantity - currentStock;
}

export function inventoryTypeForAction(action: "STOCK_IN" | "STOCK_OUT" | "ADJUSTMENT") {
  if (action === "STOCK_IN") return "IN" as const;
  if (action === "STOCK_OUT") return "OUT" as const;
  return "ADJUSTMENT" as const;
}
