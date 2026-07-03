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
  hargaAgen: number | null;
  stock: number;
  minStock: number;
  unit: string;
  size: string | null;
  material: string | null;
  categoryId: string;
  brandId?: string | null;
  storeId: string;
  isActive: boolean;
  imageUrl: string | null;
  supplierIds?: string[];
}

type ProductWithSupplierLinks = Product & {
  supplierIds?: string[];
  productSuppliers?: Array<{ supplierId: string }>;
};

function normalizedSupplierIds(product: ProductWithSupplierLinks): string[] | undefined {
  if (Array.isArray(product.supplierIds)) {
    return Array.from(new Set(product.supplierIds)).sort();
  }
  if (Array.isArray(product.productSuppliers)) {
    return Array.from(
      new Set(product.productSuppliers.map((link) => link.supplierId)),
    ).sort();
  }
  return undefined;
}

function comparableSnapshot(
  current: ProductSnapshot,
  expected: ProductSnapshot,
): ProductSnapshot {
  const normalized: ProductSnapshot = { ...current };
  if (expected.supplierIds !== undefined) {
    normalized.supplierIds = Array.from(new Set(current.supplierIds ?? [])).sort();
  } else {
    delete normalized.supplierIds;
  }

  if (expected.brandId === undefined) {
    delete normalized.brandId;
  }

  return normalized;
}

export function productSnapshot(product: ProductWithSupplierLinks): ProductSnapshot {
  const snapshot: ProductSnapshot = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    description: product.description,
    price: Number(product.price),
    costPrice: product.costPrice == null ? null : Number(product.costPrice),
    hargaDinas: product.hargaDinas == null ? null : Number(product.hargaDinas),
    hargaAgen: product.hargaAgen == null ? null : Number(product.hargaAgen),
    stock: product.stock,
    minStock: product.minStock,
    unit: product.unit,
    size: product.size,
    material: product.material,
    categoryId: product.categoryId,
    brandId: product.brandId,
    storeId: product.storeId,
    isActive: product.isActive,
    imageUrl: product.imageUrl,
  };
  const supplierIds = normalizedSupplierIds(product);
  if (supplierIds !== undefined) {
    snapshot.supplierIds = supplierIds;
  }
  return snapshot;
}

export function snapshotsMatch(current: ProductSnapshot, expected: ProductSnapshot) {
  const normalizedExpected =
    expected.supplierIds === undefined
      ? expected
      : {
        ...expected,
        supplierIds: Array.from(new Set(expected.supplierIds)).sort(),
      };
  return JSON.stringify(comparableSnapshot(current, expected)) === JSON.stringify(normalizedExpected);
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
