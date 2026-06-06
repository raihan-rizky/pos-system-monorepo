import { db, Prisma } from "@pos/db";

import type {
  SupplierInput,
  SupplierListItem,
  SupplierType,
} from "@/features/suppliers/types/supplier";
import type { SupplierRestockLog } from "@/features/suppliers/helpers/supplier-summary";

export type SupplierListFilters = {
  q?: string;
  type?: SupplierType;
  isActive?: boolean;
  skip: number;
  take: number;
};

type SupplierWhereInput = {
  OR?: Array<Record<string, { contains: string; mode: "insensitive" }>>;
  type?: SupplierType;
  isActive?: boolean;
};

export function buildSupplierWhere(filters: SupplierListFilters): SupplierWhereInput {
  const where: SupplierWhereInput = {};
  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { phone: { contains: filters.q, mode: "insensitive" } },
      { contactPerson: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  if (filters.type) where.type = filters.type;
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  return where;
}

export function countSuppliers(filters: SupplierListFilters): Promise<number> {
  return db.supplier.count({ where: buildSupplierWhere(filters) });
}

export function listSuppliers(
  filters: SupplierListFilters,
): Promise<SupplierListItem[]> {
  return db.supplier.findMany({
    where: buildSupplierWhere(filters),
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    skip: filters.skip,
    take: filters.take,
  });
}

export function findSuppliersByName(name: string): Promise<SupplierNameRow[]> {
  return db.supplier.findMany({
    where: {
      name: { contains: name.trim(), mode: "insensitive" },
    },
    select: { id: true, name: true },
    take: 20,
  });
}

export function createSupplier(input: SupplierInput): Promise<SupplierListItem> {
  return db.supplier.create({
    data: {
      name: input.name,
      type: input.type,
      phone: input.phone || null,
      contactPerson: input.contactPerson || null,
      address: input.address || null,
      notes: input.notes || null,
    },
  });
}

export function findActiveSupplierById(
  supplierId: string,
): Promise<{ id: string; name: string; isActive: boolean } | null> {
  return db.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true, isActive: true },
  });
}

export function findSupplierById(id: string): Promise<SupplierListItem | null> {
  return db.supplier.findUnique({ where: { id } });
}

export function updateSupplier(
  id: string,
  input: SupplierInput,
): Promise<SupplierListItem> {
  return db.supplier.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      phone: input.phone || null,
      contactPerson: input.contactPerson || null,
      address: input.address || null,
      notes: input.notes || null,
    },
  });
}

export function setSupplierActive(
  id: string,
  isActive: boolean,
): Promise<SupplierListItem> {
  return db.supplier.update({
    where: { id },
    data: { isActive },
  });
}

export function findSupplierRestockLogs(filters: {
  from?: Date;
  to?: Date;
  supplierId?: string;
  productId?: string;
  categoryId?: string;
  skip?: number;
  take?: number;
}): Promise<SupplierRestockLog[]> {
  const where = buildRestockLogWhere(filters);
  return db.inventoryLog.findMany({
    where,
    include: {
      supplier: {
        select: { id: true, name: true, type: true },
      },
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    skip: filters.skip,
    take: filters.take,
  }).then((logs) =>
    logs.map((log) => ({
      id: log.id,
      supplierId: log.supplierId,
      supplier: log.supplier,
      productId: log.productId,
      product: {
        id: log.product.id,
        name: log.product.name,
        unit: log.product.unit,
      },
      quantity: log.quantity,
      unitCost: log.unitCost,
      createdAt: log.createdAt,
    })),
  );
}

export function countSupplierRestockLogs(filters: {
  from?: Date;
  to?: Date;
  supplierId?: string;
  productId?: string;
  categoryId?: string;
}): Promise<number> {
  return db.inventoryLog.count({ where: buildRestockLogWhere(filters) });
}

function buildRestockLogWhere(filters: {
  from?: Date;
  to?: Date;
  supplierId?: string;
  productId?: string;
  categoryId?: string;
}): Prisma.InventoryLogWhereInput {
  return {
    type: "IN",
    reason: "RESTOCK",
    status: "APPROVED",
    supplierId: filters.supplierId ?? { not: null },
    ...(filters.productId ? { productId: filters.productId } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
    ...(filters.categoryId
      ? { product: { categoryId: filters.categoryId } }
      : {}),
  };
}

export type SupplierNameRow = {
  id: string;
  name: string;
};
