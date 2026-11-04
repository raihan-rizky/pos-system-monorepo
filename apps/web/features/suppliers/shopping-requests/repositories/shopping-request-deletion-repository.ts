import { db, type Prisma } from "@pos/db";
import { lockStockMutationRows } from "@/features/product-stock-groups/stock-group-lock";
import { buildShoppingRequestDeletionPlan, type ShoppingRequestDeletionMovement } from "../helpers/shopping-request-deletion";
import type { ShoppingRequestActor } from "../types/shopping-request";
import { ShoppingRequestDeletionError } from "../services/shopping-request-deletion-error";

type Tx = Prisma.TransactionClient;

type LockedDeletionContext = {
  request: { id: string; number: string; name: string; status: "REQUESTED" | "APPROVED" | "REJECTED" };
  receipts: Array<{ id: string; stockBundleId: string | null; status: string }>;
  movements: ShoppingRequestDeletionMovement[];
  products: Array<{ id: string; sku: string; costPrice: Prisma.Decimal | null }>;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sameQuantity(left: number, right: number): boolean {
  return Number.isFinite(left) && Number.isFinite(right) &&
    Math.abs(left - right) <= 1e-7 * Math.max(1, Math.abs(left), Math.abs(right));
}

async function loadLockedDeletionContext(tx: Tx, id: string, storeId: string): Promise<LockedDeletionContext> {
  await tx.$executeRaw`SET LOCAL lock_timeout = '3s'`;
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_shopping_requests"
    WHERE "id" = ${id} AND "storeId" = ${storeId}
    FOR UPDATE
  `;
  if (locked.length !== 1) throw new ShoppingRequestDeletionError("Daftar belanja tidak ditemukan.", 404);

  const request = await tx.shoppingRequest.findFirst({
    where: { id, storeId },
    select: {
      id: true, number: true, name: true, status: true, stockAppliedAt: true,
      items: { select: { stockAppliedAt: true } }, deletion: { select: { id: true } },
    },
  });
  if (!request) throw new ShoppingRequestDeletionError("Daftar belanja tidak ditemukan.", 404);
  if (request.status === "CANCELLED" || request.deletion) {
    throw new ShoppingRequestDeletionError("Daftar belanja sudah dibatalkan atau dihapus.");
  }
  if (request.stockAppliedAt || request.items.some((item) => item.stockAppliedAt)) {
    throw new ShoppingRequestDeletionError("Riwayat stok lama belum dapat dipastikan. Periksa stok secara manual sebelum menghapus daftar.");
  }

  // Lock purchases before enumerating receipts so a new receipt cannot appear
  // between the stock check and cancellation. A concurrent finalizer may be
  // aborted by PostgreSQL's deadlock detection and can then be retried.
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_goods_purchases"
    WHERE "storeId" = ${storeId} AND "shoppingRequestId" = ${id}
    ORDER BY "id" FOR UPDATE
  `;
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_inventory_inbound_receipts"
    WHERE "storeId" = ${storeId} AND (
      "shoppingRequestId" = ${id} OR "goodsPurchaseId" IN (
        SELECT "id" FROM "pos_goods_purchases" WHERE "storeId" = ${storeId} AND "shoppingRequestId" = ${id}
      )
    )
    ORDER BY "id" FOR UPDATE
  `;
  const receiptWhere: Prisma.InventoryInboundReceiptWhereInput = {
    storeId,
    OR: [{ shoppingRequestId: id }, { goodsPurchase: { is: { shoppingRequestId: id, storeId } } }],
  };
  const receiptSelect = {
    id: true, goodsPurchaseId: true, status: true, createdAt: true, stockBundleId: true,
    lines: { select: { id: true, productId: true, inventoryLogId: true, receivedQuantity: true } },
    stockBundle: { select: { id: true, type: true, status: true, undoOfBatchId: true, summary: true, items: { select: { productId: true, inventoryLogId: true, afterSnapshot: true } } } },
  } satisfies Prisma.InventoryInboundReceiptSelect;
  let receipts = await tx.inventoryInboundReceipt.findMany({ where: receiptWhere, select: receiptSelect });
  const batchIds = [...new Set(receipts.flatMap((receipt) => receipt.stockBundleId ? [receipt.stockBundleId] : []))].sort();
  for (const batchId of batchIds) {
    const rows = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "pos_batch_operations"
      WHERE "id" = ${batchId} AND "storeId" = ${storeId}
      FOR UPDATE
    `;
    if (rows.length !== 1) throw new ShoppingRequestDeletionError("Riwayat stok penerimaan tidak tersedia.");
  }
  // Re-read bundle status after its row lock; generic undo may have completed
  // while this transaction waited for the lock.
  if (batchIds.length) receipts = await tx.inventoryInboundReceipt.findMany({ where: receiptWhere, select: receiptSelect });

  const sourceReceipts: Array<{
    id: string;
    bundleStatus: string;
    items: Array<{ productId: string | null; inventoryLogId: string | null; afterSnapshot: unknown }>;
  }> = [];
  const productIds = new Set<string>();
  const groupIds = new Set<string>();
  const firstReceiptByGroup = new Map<string, Date>();
  const receiptProductIdsByGroup = new Map<string, Set<string>>();
  const expectedLogs = new Map<string, { productId: string; quantity: number }>();
  for (const receipt of receipts) {
    if (receipt.status !== "APPROVED") {
      if (receipt.stockBundleId || receipt.lines.some((line) => line.inventoryLogId)) {
        throw new ShoppingRequestDeletionError("Riwayat stok penerimaan belum dapat dipastikan.");
      }
      continue;
    }
    if (!receipt.stockBundleId || !receipt.stockBundle) {
      if (receipt.lines.some((line) => line.inventoryLogId || line.receivedQuantity > 0)) {
        throw new ShoppingRequestDeletionError("Riwayat stok lama belum dapat dipastikan. Periksa stok secara manual sebelum menghapus daftar.");
      }
      continue;
    }
    const summary = record(receipt.stockBundle.summary);
    if (receipt.stockBundle.type !== "INBOUND_RECEIPT" || receipt.stockBundle.undoOfBatchId !== null ||
        !receipt.goodsPurchaseId || summary?.source !== "INBOUND_RECEIPT" ||
        summary.receiptId !== receipt.id || summary.goodsPurchaseId !== receipt.goodsPurchaseId) {
      throw new ShoppingRequestDeletionError("Riwayat stok penerimaan belum dapat dipastikan.");
    }
    if (receipt.lines.some((line) => line.receivedQuantity > 0 && !line.inventoryLogId)) {
      throw new ShoppingRequestDeletionError("Riwayat stok penerimaan belum dapat dipastikan.");
    }
    const canonicalLines = new Map<string, string>();
    for (const item of receipt.stockBundle.items) {
      const impact = record(record(item.afterSnapshot)?.inboundReceiptImpact);
      if (typeof impact?.stockGroupId === "string" && item.productId) {
        const ids = receiptProductIdsByGroup.get(impact.stockGroupId) ?? new Set<string>();
        ids.add(item.productId);
        receiptProductIdsByGroup.set(impact.stockGroupId, ids);
      }
      if (impact?.kind === "VARIANT" && item.productId) productIds.add(item.productId);
      if (impact?.kind !== "CANONICAL") continue;
      if (typeof impact.receiptLineId !== "string" || !item.inventoryLogId || !item.productId ||
          canonicalLines.has(impact.receiptLineId)) {
        throw new ShoppingRequestDeletionError("Riwayat stok penerimaan belum dapat dipastikan.");
      }
      const line = receipt.lines.find((entry) => entry.id === impact.receiptLineId);
      if (!line || line.productId !== item.productId || line.inventoryLogId !== item.inventoryLogId ||
          typeof impact.delta !== "number" || !sameQuantity(impact.delta, line.receivedQuantity) ||
          expectedLogs.has(item.inventoryLogId)) {
        throw new ShoppingRequestDeletionError("Riwayat stok penerimaan belum dapat dipastikan.");
      }
      expectedLogs.set(item.inventoryLogId, { productId: item.productId, quantity: line.receivedQuantity });
      canonicalLines.set(impact.receiptLineId, item.inventoryLogId);
      productIds.add(item.productId);
      if (typeof impact.stockGroupId === "string") {
        groupIds.add(impact.stockGroupId);
        const first = firstReceiptByGroup.get(impact.stockGroupId);
        if (!first || receipt.createdAt < first) firstReceiptByGroup.set(impact.stockGroupId, receipt.createdAt);
      }
    }
    const appliedLines = receipt.lines.filter((line) => line.inventoryLogId !== null);
    if (canonicalLines.size !== appliedLines.length || appliedLines.some((line) => canonicalLines.get(line.id) !== line.inventoryLogId)) {
      throw new ShoppingRequestDeletionError("Riwayat stok penerimaan belum dapat dipastikan.");
    }
    sourceReceipts.push({ id: receipt.id, bundleStatus: receipt.stockBundle.status, items: receipt.stockBundle.items });
  }

  if (expectedLogs.size) {
    const logs = await tx.inventoryLog.findMany({
      where: { id: { in: [...expectedLogs.keys()] } },
      select: { id: true, productId: true, type: true, reason: true, status: true, quantity: true },
    });
    if (logs.length !== expectedLogs.size || logs.some((log) => {
      const expected = expectedLogs.get(log.id);
      return !expected || log.productId !== expected.productId || log.type !== "IN" ||
        log.reason !== "RESTOCK" || log.status !== "APPROVED" || !sameQuantity(log.quantity, expected.quantity);
    })) {
      throw new ShoppingRequestDeletionError("Riwayat stok penerimaan belum dapat dipastikan.");
    }
  }

  const productIdList = [...productIds].sort();
  const groupIdList = [...groupIds].sort();
  const locks = await lockStockMutationRows(tx, { storeId, productIds: productIdList, stockGroupIds: groupIdList });
  if (locks.lockedProductIds.length !== productIdList.length || locks.lockedStockGroupIds.length !== groupIdList.length) {
    throw new ShoppingRequestDeletionError("Produk atau grup stok berubah. Muat ulang dan coba lagi.");
  }
  const products = await tx.product.findMany({
    where: { storeId, id: { in: productIdList } },
    select: { id: true, name: true, sku: true, unit: true, stock: true, stockGroupId: true, unitMultiplierToBase: true, conversionNeedsReview: true, costPrice: true },
  });
  const groups = await tx.productStockGroup.findMany({
    where: { storeId, id: { in: groupIdList } }, select: { id: true, baseStock: true, baseUnit: true },
  });
  for (const [stockGroupId, createdAt] of firstReceiptByGroup) {
    const changed = await tx.productStockGroupActivity.findFirst({
      where: { stockGroupId, type: "CONVERSION_RATE_CHANGED", createdAt: { gte: createdAt } }, select: { id: true },
    });
    if (changed) throw new ShoppingRequestDeletionError("Konversi grup stok berubah setelah penerimaan. Periksa stok secara manual.");
    const adjusted = await tx.inventoryLog.findFirst({
      where: { productId: { in: [...(receiptProductIdsByGroup.get(stockGroupId) ?? [])].sort() }, type: "ADJUSTMENT", reason: "MANUAL_ADJUSTMENT", createdAt: { gte: createdAt } },
      select: { id: true },
    });
    if (adjusted) throw new ShoppingRequestDeletionError("Stok grup diubah secara manual setelah penerimaan. Periksa stok secara manual.");
  }
  let movements: ShoppingRequestDeletionMovement[];
  try {
    movements = buildShoppingRequestDeletionPlan({ receipts: sourceReceipts, products, groups }).movements;
  } catch (error) {
    throw new ShoppingRequestDeletionError(error instanceof Error ? error.message : "Dampak stok tidak dapat dipastikan.");
  }
  return {
    request: { id: request.id, number: request.number, name: request.name, status: request.status },
    receipts,
    movements,
    products,
  };
}

export async function previewShoppingRequestDeletionRecord(id: string, storeId: string) {
  return db.$transaction(async (tx) => {
    const context = await loadLockedDeletionContext(tx, id, storeId);
    return {
      id: context.request.id,
      number: context.request.number,
      name: context.request.name,
      movements: context.movements.map(({ productId, productName, stockGroupId, baseQuantity, unit }) => ({ productId, productName, stockGroupId, baseQuantity, unit })),
    };
  }, { timeout: 60_000 });
}

export async function deleteShoppingRequestRecord(id: string, reason: string, actor: ShoppingRequestActor) {
  return db.$transaction(async (tx) => {
    const context = await loadLockedDeletionContext(tx, id, actor.storeId);
    const now = new Date();
    const reversalLogs: Array<{ receiptId: string; productId: string; sourceLogId: string; reversalLogId: string; quantity: number; baseQuantity: number }> = [];
    for (const movement of context.movements) {
      const decrement = Math.min(movement.baseQuantity, movement.availableBaseStock);
      const result = movement.stockGroupId
        ? await tx.productStockGroup.updateMany({
          where: { id: movement.stockGroupId, storeId: actor.storeId, baseStock: { gte: decrement } },
          data: { baseStock: { decrement } },
        })
        : await tx.product.updateMany({
          where: { id: movement.productId, storeId: actor.storeId, stockGroupId: null, stock: { gte: decrement } },
          data: { stock: { decrement } },
        });
      if (result.count !== 1) throw new ShoppingRequestDeletionError(`Stok ${movement.productName} berubah. Muat ulang dan coba lagi.`);
      for (const source of movement.sources) {
        const product = context.products.find((entry) => entry.id === source.productId);
        if (!product) throw new ShoppingRequestDeletionError("Produk sumber stok tidak tersedia.");
        const log = await tx.inventoryLog.create({
          data: {
            productId: source.productId, type: "OUT", reason: "RESTOCK", quantity: source.quantity,
            note: `Pembatalan daftar ${context.request.number}: ${reason}`, createdBy: actor.id, person: actor.name,
            status: "APPROVED", approvedBy: actor.id, approverName: actor.name, decidedAt: now,
            unitCost: product.costPrice, stockGroupIdSnapshot: movement.stockGroupId,
            unitMultiplierSnapshot: movement.stockGroupId ? source.baseQuantity / source.quantity : 1,
            stockBaseDelta: -source.baseQuantity, sourceTransactionRef: `shopping-request:${id}`,
          }, select: { id: true },
        });
        reversalLogs.push({ receiptId: source.receiptId, productId: source.productId, sourceLogId: source.inventoryLogId, reversalLogId: log.id, quantity: source.quantity, baseQuantity: source.baseQuantity });
      }
    }

    for (const receipt of context.receipts) {
      if (receipt.status !== "APPROVED" || !receipt.stockBundleId) continue;
      const batch = await tx.batchOperation.create({
        data: {
          type: "UNDO", status: "COMMITTED", storeId: actor.storeId, createdBy: actor.id,
          undoOfBatchId: receipt.stockBundleId,
          summary: { source: "SHOPPING_REQUEST_DELETION", shoppingRequestId: id, receiptId: receipt.id, reason },
        }, select: { id: true },
      });
      const logs = reversalLogs.filter((entry) => entry.receiptId === receipt.id);
      if (logs.length) {
        await tx.batchOperationItem.createMany({ data: logs.map((entry) => ({
          batchOperationId: batch.id, productId: entry.productId,
          sku: context.products.find((product) => product.id === entry.productId)?.sku ?? "",
          action: "UNDO" as const, inventoryLogId: entry.reversalLogId,
          afterSnapshot: { sourceLogId: entry.sourceLogId, quantity: entry.quantity, baseQuantity: entry.baseQuantity },
        })) });
      }
      const updated = await tx.batchOperation.updateMany({
        where: { id: receipt.stockBundleId, storeId: actor.storeId, status: { in: ["COMMITTED", "UNDO_BLOCKED"] } },
        data: { status: "UNDONE", undoneAt: now, undoneBy: actor.id },
      });
      if (updated.count !== 1) throw new ShoppingRequestDeletionError("Penerimaan sudah dibalik atau berubah. Muat ulang halaman.");
    }

    await tx.inventoryInboundReceipt.updateMany({
      where: { id: { in: context.receipts.map((receipt) => receipt.id) }, storeId: actor.storeId, status: { in: ["DRAFT", "SUBMITTED", "NEEDS_REVISION"] } },
      data: { status: "CANCELLED", cancelledAt: now },
    });
    for (const previousStatus of ["PENDING", "APPROVED"] as const) {
      await tx.goodsPurchase.updateMany({
        where: { shoppingRequestId: id, storeId: actor.storeId, status: previousStatus },
        data: { status: "CANCELLED", statusBeforeCancellation: previousStatus, activeShoppingRequestKey: null },
      });
    }
    await tx.shoppingRequest.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: now } });
    await tx.shoppingRequestDeletion.create({
      data: {
        storeId: actor.storeId, shoppingRequestId: id, actorId: actor.id, actorName: actor.name,
        reason, previousStatus: context.request.status, details: { reversalLogs }, createdAt: now,
      },
    });
    return { id, status: "CANCELLED" as const };
  }, { timeout: 60_000 });
}
