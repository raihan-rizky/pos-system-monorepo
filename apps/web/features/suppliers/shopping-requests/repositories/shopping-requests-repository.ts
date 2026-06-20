import { db, Prisma } from "@pos/db";
import type {
  ShoppingRequestDetail,
  ShoppingRequestItemRecord,
  ShoppingRequestListItem,
  ShoppingRequestStatus,
} from "../types/shopping-request";

export type ShoppingRequestListFilters = {
  q?: string;
  status?: ShoppingRequestStatus;
  supplierId?: string;
  skip: number;
  take: number;
};

type PrismaCreateItem = {
  productId: string;
  productName: string;
  unit: string | null;
  stockOnHand: number;
  requestedQty: number;
};

export type CreateShoppingRequestInputRepo = {
  storeId: string;
  number: string;
  sequence: number;
  supplierId: string | null;
  requestedByName: string | null;
  note: string | null;
  items: PrismaCreateItem[];
};

export type UpdateShoppingRequestStatusInputRepo = {
  status: ShoppingRequestStatus;
  approvedById: string | null;
  approvedByName: string | null;
  approvedAt: Date | null;
  cancelledAt: Date | null;
};

export function buildShoppingRequestWhere(
  filters: ShoppingRequestListFilters,
): Prisma.ShoppingRequestWhereInput {
  const where: Prisma.ShoppingRequestWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.supplierId) where.supplierId = filters.supplierId;
  if (filters.q) {
    where.OR = [
      { number: { contains: filters.q, mode: "insensitive" } },
      { requestedByName: { contains: filters.q, mode: "insensitive" } },
    ];
  }
  return where;
}

export function countShoppingRequests(
  filters: ShoppingRequestListFilters,
): Promise<number> {
  return db.shoppingRequest.count({ where: buildShoppingRequestWhere(filters) });
}

export function listShoppingRequests(
  filters: ShoppingRequestListFilters,
): Promise<ShoppingRequestListItem[]> {
  return db.shoppingRequest
    .findMany({
      where: buildShoppingRequestWhere(filters),
      include: {
        supplier: { select: { id: true, name: true } },
        _count: { select: { items: true } },
        items: { select: { requestedQty: true, approvedQty: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: filters.skip,
      take: filters.take,
    })
    .then((rows) =>
      rows.map((row) => ({
        id: row.id,
        number: row.number,
        status: row.status,
        supplierId: row.supplierId,
        supplierName: row.supplier?.name ?? null,
        requestedByName: row.requestedByName,
        approvedByName: row.approvedByName,
        itemCount: row._count.items,
        totalRequestedQty: row.items.reduce(
          (sum, item) => sum + item.requestedQty,
          0,
        ),
        totalApprovedQty:
          row.approvedById === null &&
          row.items.every((item) => item.approvedQty === null)
            ? null
            : row.items.reduce(
                (sum, item) => sum + (item.approvedQty ?? 0),
                0,
              ),
        createdAt: row.createdAt.toISOString(),
        approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
        note: row.note,
      })),
    );
}

export function findShoppingRequestById(
  id: string,
): Promise<ShoppingRequestDetail | null> {
  return db.shoppingRequest
    .findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { name: true, sku: true, unit: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    })
    .then((row) => {
      if (!row) return null;
      const items: ShoppingRequestItemRecord[] = row.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        productSku: item.product.sku,
        unit: item.unit ?? item.product.unit,
        stockOnHand: item.stockOnHand,
        requestedQty: item.requestedQty,
        approvedQty: item.approvedQty,
      }));
      const totalRequestedQty = items.reduce(
        (sum, item) => sum + item.requestedQty,
        0,
      );
      const allApproved = items.every((item) => item.approvedQty !== null);
      const totalApprovedQty = allApproved
        ? items.reduce((sum, item) => sum + (item.approvedQty ?? 0), 0)
        : null;
      return {
        id: row.id,
        number: row.number,
        status: row.status,
        supplierId: row.supplierId,
        supplierName: row.supplier?.name ?? null,
        requestedByName: row.requestedByName,
        approvedByName: row.approvedByName,
        itemCount: items.length,
        totalRequestedQty,
        totalApprovedQty,
        createdAt: row.createdAt.toISOString(),
        approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
        note: row.note,
        items,
      };
    });
}

export async function createShoppingRequestWithItems(
  input: CreateShoppingRequestInputRepo,
  tx: Prisma.TransactionClient = db,
): Promise<ShoppingRequestDetail> {
  const row = await tx.shoppingRequest.create({
    data: {
      storeId: input.storeId,
      number: input.number,
      sequence: input.sequence,
      supplierId: input.supplierId,
      requestedByName: input.requestedByName,
      note: input.note,
      items: {
        create: input.items.map((item) => ({
          productId: item.productId,
          productName: item.productName,
          unit: item.unit,
          stockOnHand: item.stockOnHand,
          requestedQty: item.requestedQty,
        })),
      },
    },
    include: {
      items: {
        include: {
          product: { select: { name: true, sku: true, unit: true } },
        },
      },
      supplier: { select: { id: true, name: true } },
    },
  });
  return reify(row);
}

export async function updateShoppingRequestItems(
  id: string,
  items: { id: string; approvedQty: number }[],
  tx: Prisma.TransactionClient = db,
): Promise<void> {
  await Promise.all(
    items.map((item) =>
      tx.shoppingRequestItem.update({
        where: { id: item.id },
        data: { approvedQty: item.approvedQty },
      }),
    ),
  );
}

export async function updateShoppingRequestStatus(
  id: string,
  data: UpdateShoppingRequestStatusInputRepo,
  tx: Prisma.TransactionClient = db,
): Promise<ShoppingRequestDetail> {
  const row = await tx.shoppingRequest.update({
    where: { id },
    data: {
      status: data.status,
      approvedById: data.approvedById,
      approvedByName: data.approvedByName,
      approvedAt: data.approvedAt,
      cancelledAt: data.cancelledAt,
    },
    include: {
      items: {
        include: {
          product: { select: { name: true, sku: true, unit: true } },
        },
      },
      supplier: { select: { id: true, name: true } },
    },
  });
  return reify(row);
}

function reify(row: {
  id: string;
  number: string;
  status: ShoppingRequestStatus;
  supplierId: string | null;
  requestedByName: string | null;
  approvedByName: string | null;
  approvedById: string | null;
  approvedAt: Date | null;
  note: string | null;
  createdAt: Date;
  supplier: { id: string; name: string } | null;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    unit: string | null;
    stockOnHand: number;
    requestedQty: number;
    approvedQty: number | null;
    product: { name: string; sku: string; unit: string };
  }>;
}): ShoppingRequestDetail {
  const items: ShoppingRequestItemRecord[] = row.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    productSku: item.product.sku,
    unit: item.unit ?? item.product.unit,
    stockOnHand: item.stockOnHand,
    requestedQty: item.requestedQty,
    approvedQty: item.approvedQty,
  }));
  const totalRequestedQty = items.reduce(
    (sum, item) => sum + item.requestedQty,
    0,
  );
  const allApproved = items.every((item) => item.approvedQty !== null);
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    supplierId: row.supplierId,
    supplierName: row.supplier?.name ?? null,
    requestedByName: row.requestedByName,
    approvedByName: row.approvedByName,
    itemCount: items.length,
    totalRequestedQty,
    totalApprovedQty: allApproved
      ? items.reduce((sum, item) => sum + (item.approvedQty ?? 0), 0)
      : null,
    createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    note: row.note,
    items,
  };
}
