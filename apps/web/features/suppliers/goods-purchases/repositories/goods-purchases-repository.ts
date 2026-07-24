import { db, Prisma } from "@pos/db";
import { buildProductPriceLogEntries } from "@/lib/product-price-logs/price-log-entries";
import {
  hasMasterHppDifference,
  isLargePurchaseUnit,
} from "../helpers/goods-purchase-core";
import type {
  CreateGoodsPurchaseInput,
  AddGoodsPurchaseItemInput,
  EditGoodsPurchaseItemInput,
  EligibleShoppingRequest,
  GoodsPurchaseActor,
  GoodsPurchaseDetail,
  GoodsPurchaseListItem,
  GoodsPurchaseMutationResult,
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
      | "ACTIVE_REQUEST_CONFLICT"
      | "PURCHASE_NUMBER_CONFLICT"
      | "NOT_PENDING"
      | "ITEM_NOT_FOUND"
      | "DUPLICATE_PRODUCT"
      | "SMALL_UNIT"
      | "INVALID_UNIT_VARIANT"
      | "MIN_ITEMS",
  ) {
    super(code);
    this.name = "GoodsPurchaseRepositoryError";
  }
}

const goodsPurchaseInclude = {
  shoppingRequest: { select: { number: true } },
  items: {
    orderBy: { createdAt: "asc" as const },
    include: {
      product: { select: { stockGroupId: true } },
    },
  },
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
      stockGroupId: item.product.stockGroupId,
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
  const largeProducts: Array<{
    id: string;
    name: string;
    sku: string;
    unit: string | null;
    unitMultiplierToBase: number;
    costPrice: Prisma.Decimal | null;
    stockGroupId: string | null;
    stockGroup: { displayName: string } | null;
  }> = [];
  const pageSize = 200;
  let skip = 0;

  while (largeProducts.length < 100) {
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
      orderBy: [{ name: "asc" }, { id: "asc" }],
      skip,
      take: pageSize,
    });
    largeProducts.push(...rows.filter(isLargePurchaseUnit));
    if (rows.length < pageSize) break;
    skip += pageSize;
  }

  return largeProducts.slice(0, 100).map((product) => ({
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

      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "pos_stores"
        WHERE "id" = ${actor.storeId}
        FOR UPDATE
      `;

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
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.map(String).join(",")
        : String(error.meta?.target ?? "");
      if (target.includes("activeShoppingRequestKey")) {
        throw new GoodsPurchaseRepositoryError(
          "ACTIVE_REQUEST_CONFLICT",
        );
      }
      if (
        target.includes("storeId") &&
        target.includes("number")
      ) {
        throw new GoodsPurchaseRepositoryError(
          "PURCHASE_NUMBER_CONFLICT",
        );
      }
    }
    throw error;
  }
}

type TransactionClient = Prisma.TransactionClient;

async function loadPendingGoodsPurchase(
  tx: TransactionClient,
  purchaseId: string,
  storeId: string,
): Promise<GoodsPurchaseRow> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "pos_goods_purchases"
    WHERE "id" = ${purchaseId}
      AND "storeId" = ${storeId}
      AND "status" = 'PENDING'::"GoodsPurchaseStatus"
    FOR UPDATE
  `;
  if (locked.length === 0) {
    throw new GoodsPurchaseRepositoryError("NOT_PENDING");
  }
  const purchase = await tx.goodsPurchase.findFirst({
    where: { id: purchaseId, storeId, status: "PENDING" },
    include: goodsPurchaseInclude,
  });
  if (!purchase) throw new GoodsPurchaseRepositoryError("NOT_PENDING");
  return purchase;
}

async function loadGoodsPurchaseDetail(
  tx: TransactionClient,
  purchaseId: string,
  storeId: string,
): Promise<GoodsPurchaseDetail> {
  const purchase = await tx.goodsPurchase.findFirst({
    where: { id: purchaseId, storeId },
    include: goodsPurchaseInclude,
  });
  if (!purchase) throw new GoodsPurchaseRepositoryError("NOT_FOUND");
  return mapGoodsPurchaseDetail(purchase);
}

function sumLineTotals(
  items: Array<{ lineTotal: Prisma.Decimal }>,
): Prisma.Decimal {
  return items
    .reduce(
      (total, item) => total.add(item.lineTotal),
      new Prisma.Decimal(0),
    )
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

async function finalizeGoodsPurchaseIfReady(
  tx: TransactionClient,
  purchaseId: string,
  actor: GoodsPurchaseActor,
  now: Date,
): Promise<GoodsPurchaseMutationResult> {
  const purchase = await loadPendingGoodsPurchase(
    tx,
    purchaseId,
    actor.storeId,
  );
  if (purchase.items.length === 0) {
    throw new GoodsPurchaseRepositoryError("MIN_ITEMS");
  }
  if (purchase.items.some((item) => item.reviewStatus === "PENDING")) {
    return { data: mapGoodsPurchaseDetail(purchase), finalized: false };
  }

  const totalAmount = sumLineTotals(purchase.items);
  const claim = await tx.goodsPurchase.updateMany({
    where: {
      id: purchaseId,
      storeId: actor.storeId,
      status: "PENDING",
    },
    data: {
      status: "APPROVED",
      totalAmount,
      approvedById: actor.id,
      approvedByName: actor.name,
      approvedAt: now,
    },
  });
  if (claim.count !== 1) {
    throw new GoodsPurchaseRepositoryError("NOT_PENDING");
  }

  const hppItems = purchase.items.filter((item) => item.updateMasterHpp);
  if (hppItems.length > 0) {
    const products = await tx.product.findMany({
      where: {
        id: { in: hppItems.map((item) => item.productId) },
        storeId: actor.storeId,
      },
      select: {
        id: true,
        price: true,
        costPrice: true,
        hargaAgen: true,
        hargaDinas: true,
      },
    });
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const logEntries = [];

    for (const item of hppItems) {
      const product = productsById.get(item.productId);
      if (!product) {
        throw new GoodsPurchaseRepositoryError("PRODUCT_NOT_FOUND");
      }
      const latestHpp = item.latestUnitPrice.toDecimalPlaces(
        2,
        Prisma.Decimal.ROUND_HALF_UP,
      );
      if (
        !hasMasterHppDifference(
          decimalToNumber(product.costPrice),
          Number(latestHpp.toString()),
        )
      ) {
        continue;
      }

      await tx.product.update({
        where: { id: product.id },
        data: { costPrice: latestHpp },
      });
      logEntries.push(
        ...buildProductPriceLogEntries({
          productId: product.id,
          storeId: actor.storeId,
          before: {
            price: product.price,
            costPrice: product.costPrice,
            hargaAgen: product.hargaAgen,
            hargaDinas: product.hargaDinas,
          },
          after: {
            price: product.price,
            costPrice: latestHpp,
            hargaAgen: product.hargaAgen,
            hargaDinas: product.hargaDinas,
          },
          actor,
          source: "SYSTEM",
          note: `Pembelian Barang ${purchase.number}`,
        }),
      );
    }

    if (logEntries.length > 0) {
      await tx.productPriceLog.createMany({ data: logEntries });
    }
  }

  await tx.expense.create({
    data: {
      storeId: actor.storeId,
      recordedById: actor.id,
      shoppingRequestId: purchase.shoppingRequestId,
      goodsPurchaseId: purchase.id,
      applicantName: purchase.supplierNameSnapshot,
      category: "SUPPLIES",
      description: `Pembelian Barang ${purchase.number} - ${purchase.items.length} produk`,
      amount: totalAmount,
      changeAmount: 0,
      occurredAt: now,
      hasMissingCostSnapshot: false,
    },
  });

  return {
    data: await loadGoodsPurchaseDetail(
      tx,
      purchaseId,
      actor.storeId,
    ),
    finalized: true,
  };
}

export async function approveGoodsPurchaseItemRecord(
  purchaseId: string,
  itemId: string,
  actor: GoodsPurchaseActor,
  now = new Date(),
): Promise<GoodsPurchaseMutationResult> {
  return db.$transaction(async (tx) => {
    const purchase = await loadPendingGoodsPurchase(
      tx,
      purchaseId,
      actor.storeId,
    );
    const item = purchase.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new GoodsPurchaseRepositoryError("ITEM_NOT_FOUND");

    await tx.goodsPurchaseItem.update({
      where: { id: itemId },
      data: {
        reviewStatus: "APPROVED",
        approvedById: actor.id,
        approvedByName: actor.name,
        approvedAt: now,
      },
    });
    return finalizeGoodsPurchaseIfReady(tx, purchaseId, actor, now);
  });
}

export async function editGoodsPurchaseItemRecord(
  purchaseId: string,
  itemId: string,
  input: EditGoodsPurchaseItemInput,
  actor: GoodsPurchaseActor,
): Promise<GoodsPurchaseMutationResult> {
  return db.$transaction(async (tx) => {
    const purchase = await loadPendingGoodsPurchase(
      tx,
      purchaseId,
      actor.storeId,
    );
    const item = purchase.items.find((candidate) => candidate.id === itemId);
    if (!item) throw new GoodsPurchaseRepositoryError("ITEM_NOT_FOUND");
    if (
      purchase.items.some(
        (candidate) =>
          candidate.id !== itemId &&
          candidate.productId === input.productId,
      )
    ) {
      throw new GoodsPurchaseRepositoryError("DUPLICATE_PRODUCT");
    }

    const product = await tx.product.findFirst({
      where: {
        id: input.productId,
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
        stockGroupId: true,
      },
    });
    if (!product) {
      throw new GoodsPurchaseRepositoryError("PRODUCT_NOT_FOUND");
    }
    if (
      product.id !== item.productId &&
      (!isLargePurchaseUnit(product) ||
        item.product.stockGroupId === null ||
        product.stockGroupId !== item.product.stockGroupId)
    ) {
      throw new GoodsPurchaseRepositoryError(
        "INVALID_UNIT_VARIANT",
      );
    }

    const latestUnitPrice = new Prisma.Decimal(
      String(input.latestUnitPrice),
    ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const lineTotal = latestUnitPrice
      .mul(new Prisma.Decimal(String(input.quantity)))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    await tx.goodsPurchaseItem.update({
      where: { id: itemId },
      data: {
        productId: input.productId,
        productNameSnapshot: product.name,
        skuSnapshot: product.sku,
        unitSnapshot: product.unit,
        unitMultiplierSnapshot: product.unitMultiplierToBase,
        quantity: input.quantity,
        masterCostPriceSnapshot: product.costPrice,
        latestUnitPrice,
        lineTotal,
        updateMasterHpp:
          input.updateMasterHpp &&
          hasMasterHppDifference(
            decimalToNumber(product.costPrice),
            input.latestUnitPrice,
          ),
        reviewStatus: "PENDING",
        approvedById: null,
        approvedByName: null,
        approvedAt: null,
      },
    });

    const totalAmount = sumLineTotals([
      ...purchase.items
        .filter((candidate) => candidate.id !== itemId)
        .map((candidate) => ({ lineTotal: candidate.lineTotal })),
      { lineTotal },
    ]);
    await tx.goodsPurchase.update({
      where: { id: purchaseId },
      data: { totalAmount },
    });
    return {
      data: await loadGoodsPurchaseDetail(
        tx,
        purchaseId,
        actor.storeId,
      ),
      finalized: false,
    };
  });
}

export async function addGoodsPurchaseItemRecord(
  purchaseId: string,
  input: AddGoodsPurchaseItemInput,
  actor: GoodsPurchaseActor,
): Promise<GoodsPurchaseMutationResult> {
  return db.$transaction(async (tx) => {
    const purchase = await loadPendingGoodsPurchase(
      tx,
      purchaseId,
      actor.storeId,
    );
    if (
      purchase.items.some((item) => item.productId === input.productId)
    ) {
      throw new GoodsPurchaseRepositoryError("DUPLICATE_PRODUCT");
    }
    const product = await tx.product.findFirst({
      where: {
        id: input.productId,
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
    if (!product) {
      throw new GoodsPurchaseRepositoryError("PRODUCT_NOT_FOUND");
    }
    if (!isLargePurchaseUnit(product)) {
      throw new GoodsPurchaseRepositoryError("SMALL_UNIT");
    }

    const latestUnitPrice = new Prisma.Decimal(
      String(input.latestUnitPrice),
    ).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    const lineTotal = latestUnitPrice
      .mul(new Prisma.Decimal(String(input.quantity)))
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
    await tx.goodsPurchaseItem.create({
      data: {
        goodsPurchaseId: purchaseId,
        productId: product.id,
        productNameSnapshot: product.name,
        skuSnapshot: product.sku,
        unitSnapshot: product.unit,
        unitMultiplierSnapshot: product.unitMultiplierToBase,
        quantity: input.quantity,
        masterCostPriceSnapshot: product.costPrice,
        latestUnitPrice,
        lineTotal,
        updateMasterHpp:
          input.updateMasterHpp &&
          hasMasterHppDifference(
            decimalToNumber(product.costPrice),
            input.latestUnitPrice,
          ),
        reviewStatus: "PENDING",
      },
    });
    await tx.goodsPurchase.update({
      where: { id: purchaseId },
      data: {
        totalAmount: sumLineTotals([
          ...purchase.items.map((item) => ({
            lineTotal: item.lineTotal,
          })),
          { lineTotal },
        ]),
      },
    });
    return {
      data: await loadGoodsPurchaseDetail(
        tx,
        purchaseId,
        actor.storeId,
      ),
      finalized: false,
    };
  });
}

export async function removeGoodsPurchaseItemRecord(
  purchaseId: string,
  itemId: string,
  actor: GoodsPurchaseActor,
  now = new Date(),
): Promise<GoodsPurchaseMutationResult> {
  return db.$transaction(async (tx) => {
    const purchase = await loadPendingGoodsPurchase(
      tx,
      purchaseId,
      actor.storeId,
    );
    if (purchase.items.length <= 1) {
      throw new GoodsPurchaseRepositoryError("MIN_ITEMS");
    }
    if (!purchase.items.some((item) => item.id === itemId)) {
      throw new GoodsPurchaseRepositoryError("ITEM_NOT_FOUND");
    }

    await tx.goodsPurchaseItem.delete({ where: { id: itemId } });
    await tx.goodsPurchase.update({
      where: { id: purchaseId },
      data: {
        totalAmount: sumLineTotals(
          purchase.items
            .filter((item) => item.id !== itemId)
            .map((item) => ({ lineTotal: item.lineTotal })),
        ),
      },
    });
    return finalizeGoodsPurchaseIfReady(tx, purchaseId, actor, now);
  });
}

export async function rejectGoodsPurchaseRecord(
  purchaseId: string,
  reason: string,
  actor: GoodsPurchaseActor,
  now = new Date(),
): Promise<GoodsPurchaseDetail> {
  return db.$transaction(async (tx) => {
    await loadPendingGoodsPurchase(tx, purchaseId, actor.storeId);
    const result = await tx.goodsPurchase.updateMany({
      where: {
        id: purchaseId,
        storeId: actor.storeId,
        status: "PENDING",
      },
      data: {
        status: "REJECTED",
        activeShoppingRequestKey: null,
        rejectedById: actor.id,
        rejectedByName: actor.name,
        rejectionReason: reason,
        rejectedAt: now,
      },
    });
    if (result.count !== 1) {
      throw new GoodsPurchaseRepositoryError("NOT_PENDING");
    }
    return loadGoodsPurchaseDetail(tx, purchaseId, actor.storeId);
  });
}
