import { db, Prisma } from "@pos/db";
import {
  hasMasterHppDifference,
  isLargePurchaseUnit,
} from "../helpers/goods-purchase-core";
import type {
  CreateGoodsPurchaseInput,
  EligibleShoppingRequest,
  GoodsPurchaseActor,
  GoodsPurchaseDetail,
  GoodsPurchaseListItem,
  GoodsPurchaseStatus,
  LargeUnitProductOption,
} from "../types/goods-purchase";

export type GoodsPurchaseListFilters = {
  storeId: string;
  q?: string;
  status?: GoodsPurchaseStatus;
  skip: number;
  take: number;
};

export class GoodsPurchaseRepositoryError extends Error {
  constructor(
    public readonly code:
      | "NOT_FOUND"
      | "REQUEST_NOT_ELIGIBLE"
      | "ITEM_SET_MISMATCH"
      | "PRODUCT_NOT_FOUND"
      | "ACTIVE_REQUEST_CONFLICT",
  ) {
    super(code);
    this.name = "GoodsPurchaseRepositoryError";
  }
}

const goodsPurchaseInclude = {
  shoppingRequest: { select: { number: true } },
  items: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.GoodsPurchaseInclude;

type GoodsPurchaseRow = Prisma.GoodsPurchaseGetPayload<{
  include: typeof goodsPurchaseInclude;
}>;

function decimalToNumber(value: Prisma.Decimal | null): number | null {
  return value === null ? null : Number(value.toString());
}

function mapGoodsPurchaseListItem(
  row: GoodsPurchaseRow,
): GoodsPurchaseListItem {
  return {
    id: row.id,
    number: row.number,
    shoppingRequestId: row.shoppingRequestId,
    shoppingRequestNumber: row.shoppingRequest.number,
    supplierName: row.supplierNameSnapshot,
    status: row.status,
    itemCount: row.items.length,
    pendingItemCount: row.items.filter(
      (item) => item.reviewStatus === "PENDING",
    ).length,
    totalAmount: Number(row.totalAmount.toString()),
    createdByName: row.createdByName,
    createdAt: row.createdAt.toISOString(),
    approvedAt: row.approvedAt?.toISOString() ?? null,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
  };
}

export function mapGoodsPurchaseDetail(
  row: GoodsPurchaseRow,
): GoodsPurchaseDetail {
  return {
    ...mapGoodsPurchaseListItem(row),
    supplierId: row.supplierId,
    approvedByName: row.approvedByName,
    rejectedByName: row.rejectedByName,
    rejectionReason: row.rejectionReason,
    items: row.items.map((item) => ({
      id: item.id,
      shoppingRequestItemId: item.shoppingRequestItemId,
      productId: item.productId,
      productName: item.productNameSnapshot,
      sku: item.skuSnapshot,
      unit: item.unitSnapshot,
      unitMultiplierToBase: item.unitMultiplierSnapshot,
      quantity: item.quantity,
      masterCostPriceSnapshot: decimalToNumber(
        item.masterCostPriceSnapshot,
      ),
      latestUnitPrice: Number(item.latestUnitPrice.toString()),
      lineTotal: Number(item.lineTotal.toString()),
      updateMasterHpp: item.updateMasterHpp,
      reviewStatus: item.reviewStatus,
      approvedByName: item.approvedByName,
      approvedAt: item.approvedAt?.toISOString() ?? null,
    })),
  };
}

function buildGoodsPurchaseWhere(
  filters: GoodsPurchaseListFilters,
): Prisma.GoodsPurchaseWhereInput {
  return {
    storeId: filters.storeId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q
      ? {
          OR: [
            { number: { contains: filters.q, mode: "insensitive" as const } },
            {
              supplierNameSnapshot: {
                contains: filters.q,
                mode: "insensitive" as const,
              },
            },
            {
              shoppingRequest: {
                number: {
                  contains: filters.q,
                  mode: "insensitive" as const,
                },
              },
            },
          ],
        }
      : {}),
  };
}

export function countGoodsPurchases(
  filters: GoodsPurchaseListFilters,
): Promise<number> {
  return db.goodsPurchase.count({
    where: buildGoodsPurchaseWhere(filters),
  });
}

export async function listGoodsPurchases(
  filters: GoodsPurchaseListFilters,
): Promise<GoodsPurchaseListItem[]> {
  const rows = await db.goodsPurchase.findMany({
    where: buildGoodsPurchaseWhere(filters),
    include: goodsPurchaseInclude,
    orderBy: { createdAt: "desc" },
    skip: filters.skip,
    take: filters.take,
  });
  return rows.map(mapGoodsPurchaseListItem);
}

export async function findGoodsPurchaseById(
  id: string,
  storeId: string,
): Promise<GoodsPurchaseDetail | null> {
  const row = await db.goodsPurchase.findFirst({
    where: { id, storeId },
    include: goodsPurchaseInclude,
  });
  return row ? mapGoodsPurchaseDetail(row) : null;
}

export async function listEligibleShoppingRequests(
  storeId: string,
  q?: string,
): Promise<EligibleShoppingRequest[]> {
  const rows = await db.shoppingRequest.findMany({
    where: {
      storeId,
      status: "APPROVED",
      supplierId: { not: null },
      supplier: { isActive: true },
      expense: null,
      goodsPurchases: {
        none: { activeShoppingRequestKey: { not: null } },
      },
      items: {
        some: {
          decisionStatus: "APPROVED",
          approvedQty: { gt: 0 },
        },
      },
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" as const } },
              {
                supplier: {
                  name: { contains: q, mode: "insensitive" as const },
                },
              },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      number: true,
      supplierId: true,
      approvedAt: true,
      supplier: { select: { name: true } },
      items: {
        where: {
          decisionStatus: "APPROVED",
          approvedQty: { gt: 0 },
          product: { isActive: true },
        },
        select: {
          id: true,
          productId: true,
          productName: true,
          approvedQty: true,
          product: {
            select: {
              sku: true,
              unit: true,
              unitMultiplierToBase: true,
              costPrice: true,
              isActive: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { approvedAt: "desc" },
  });

  return rows
    .filter(
      (
        row,
      ): row is typeof row & {
        supplierId: string;
        supplier: { name: string };
      } => Boolean(row.supplierId && row.supplier && row.items.length > 0),
    )
    .map((row) => ({
      id: row.id,
      number: row.number,
      supplierId: row.supplierId,
      supplierName: row.supplier.name,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      items: row.items.map((item) => ({
        shoppingRequestItemId: item.id,
        productId: item.productId,
        productName: item.productName,
        sku: item.product.sku,
        unit: item.product.unit,
        unitMultiplierToBase: item.product.unitMultiplierToBase,
        approvedQty: item.approvedQty ?? 0,
        currentCostPrice: decimalToNumber(item.product.costPrice),
      })),
    }));
}

export async function listLargeUnitProducts(
  storeId: string,
  q?: string,
): Promise<LargeUnitProductOption[]> {
  const rows = await db.product.findMany({
    where: {
      storeId,
      isActive: true,
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { sku: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      name: true,
      sku: true,
      unit: true,
      unitMultiplierToBase: true,
      costPrice: true,
      stockGroupId: true,
      stockGroup: { select: { displayName: true } },
    },
    orderBy: { name: "asc" },
    take: 100,
  });

  return rows.filter(isLargePurchaseUnit).map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    unit: product.unit,
    unitMultiplierToBase: product.unitMultiplierToBase,
    costPrice: decimalToNumber(product.costPrice),
    stockGroupId: product.stockGroupId,
    stockGroupName: product.stockGroup?.displayName ?? null,
  }));
}

export async function createGoodsPurchaseRecord(
  input: CreateGoodsPurchaseInput,
  actor: GoodsPurchaseActor,
  now: Date,
): Promise<GoodsPurchaseDetail> {
  try {
    return await db.$transaction(async (tx) => {
      const request = await tx.shoppingRequest.findFirst({
        where: {
          id: input.shoppingRequestId,
          storeId: actor.storeId,
          status: "APPROVED",
          supplierId: { not: null },
          supplier: { isActive: true },
          expense: null,
          goodsPurchases: {
            none: { activeShoppingRequestKey: { not: null } },
          },
        },
        include: {
          supplier: true,
          items: {
            where: {
              decisionStatus: "APPROVED",
              approvedQty: { gt: 0 },
            },
          },
        },
      });
      if (!request?.supplier || !request.supplierId) {
        throw new GoodsPurchaseRepositoryError("REQUEST_NOT_ELIGIBLE");
      }

      const expectedItemIds = new Set(
        request.items.map((item) => item.id),
      );
      const submittedItemIds = new Set(
        input.items.map((item) => item.shoppingRequestItemId),
      );
      if (
        expectedItemIds.size !== submittedItemIds.size ||
        [...expectedItemIds].some((id) => !submittedItemIds.has(id))
      ) {
        throw new GoodsPurchaseRepositoryError("ITEM_SET_MISMATCH");
      }

      const productIds = input.items.map((item) => item.productId);
      const products = await tx.product.findMany({
        where: {
          id: { in: productIds },
          storeId: actor.storeId,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          unitMultiplierToBase: true,
          costPrice: true,
        },
      });
      const productsById = new Map(
        products.map((product) => [product.id, product]),
      );
      const requestItemsById = new Map(
        request.items.map((item) => [item.id, item]),
      );
      const hasInvalidProduct = input.items.some((item) => {
        const requestItem = requestItemsById.get(
          item.shoppingRequestItemId,
        );
        return (
          !productsById.has(item.productId) ||
          requestItem?.productId !== item.productId
        );
      });
      if (hasInvalidProduct) {
        throw new GoodsPurchaseRepositoryError("PRODUCT_NOT_FOUND");
      }

      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const nextMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      );
      const sequence =
        (await tx.goodsPurchase.count({
          where: {
            storeId: actor.storeId,
            createdAt: { gte: monthStart, lt: nextMonth },
          },
        })) + 1;
      const number = `PB-${now.getUTCFullYear()}${String(
        now.getUTCMonth() + 1,
      ).padStart(2, "0")}-${String(sequence).padStart(3, "0")}`;

      let totalAmount = new Prisma.Decimal(0);
      const createItems = input.items.map((item) => {
        const product = productsById.get(item.productId)!;
        const latestUnitPrice = new Prisma.Decimal(
          String(item.latestUnitPrice),
        ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const lineTotal = latestUnitPrice
          .mul(new Prisma.Decimal(String(item.quantity)))
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        totalAmount = totalAmount.add(lineTotal);
        const currentHpp = decimalToNumber(product.costPrice);

        return {
          shoppingRequestItemId: item.shoppingRequestItemId,
          productId: item.productId,
          productNameSnapshot: product.name,
          skuSnapshot: product.sku,
          unitSnapshot: product.unit,
          unitMultiplierSnapshot: product.unitMultiplierToBase,
          quantity: item.quantity,
          masterCostPriceSnapshot: product.costPrice,
          latestUnitPrice,
          lineTotal,
          updateMasterHpp:
            item.updateMasterHpp &&
            hasMasterHppDifference(currentHpp, item.latestUnitPrice),
          reviewStatus: "PENDING" as const,
        };
      });

      const created = await tx.goodsPurchase.create({
        data: {
          storeId: actor.storeId,
          number,
          sequence,
          shoppingRequestId: request.id,
          activeShoppingRequestKey: request.id,
          supplierId: request.supplierId,
          supplierNameSnapshot: request.supplier.name,
          totalAmount: totalAmount.toDecimalPlaces(
            2,
            Prisma.Decimal.ROUND_HALF_UP,
          ),
          createdById: actor.id,
          createdByName: actor.name,
          items: { create: createItems },
        },
        select: { id: true },
      });

      const row = await tx.goodsPurchase.findFirst({
        where: { id: created.id, storeId: actor.storeId },
        include: goodsPurchaseInclude,
      });
      if (!row) throw new GoodsPurchaseRepositoryError("NOT_FOUND");
      return mapGoodsPurchaseDetail(row);
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new GoodsPurchaseRepositoryError("ACTIVE_REQUEST_CONFLICT");
    }
    throw error;
  }
}
