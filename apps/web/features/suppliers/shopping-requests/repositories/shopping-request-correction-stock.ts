import { Prisma } from "@pos/db";
import { lockStockMutationRows } from "@/features/product-stock-groups/stock-group-lock";
import { getInboundStockQuantity } from "@/features/inventory-management/helpers/inbound-receipt-rules";
import { planCorrectionStock } from "../helpers/shopping-request-correction";
import type { ShoppingRequestActor } from "../types/shopping-request";

export type CorrectionStockChange = {
  productId: string;
  shoppingRequestItemId: string | null;
  goodsPurchaseItemId: string;
  receiptLineId: string | null;
  oldReceivedQty: number;
  newReceivedQty: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function sameQuantity(left: number, right: number): boolean {
  const tolerance = Math.min(1e-9, Number.EPSILON * 8 * Math.max(1, Math.abs(left), Math.abs(right)));
  return Math.abs(left - right) <= tolerance;
}

export async function applyCorrectionStock(
  tx: Prisma.TransactionClient,
  input: { storeId: string; requestId: string; correctionId: string; actor: ShoppingRequestActor; reason: string; changes: CorrectionStockChange[] },
): Promise<void> {
  if (input.actor.storeId !== input.storeId) throw new Error("Toko koreksi tidak sesuai.");
  const requestRows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_shopping_requests"
    WHERE "id" = ${input.requestId} AND "storeId" = ${input.storeId} AND "status" <> 'CANCELLED'
    FOR UPDATE`;
  if (requestRows.length !== 1) throw new Error("Daftar belanja tidak tersedia.");
  const audit = await tx.shoppingRequestCorrection.findFirst({
    where: { id: input.correctionId, storeId: input.storeId, shoppingRequestId: input.requestId, actorId: input.actor.id },
    select: { id: true, _count: { select: { movements: true } } },
  });
  if (!audit || audit._count.movements) throw new Error("Koreksi tidak tersedia atau sudah diterapkan.");

  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_goods_purchases" WHERE "storeId" = ${input.storeId} AND "shoppingRequestId" = ${input.requestId}
    ORDER BY "id" FOR UPDATE`;
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_inventory_inbound_receipts"
    WHERE "storeId" = ${input.storeId} AND ("shoppingRequestId" = ${input.requestId} OR "goodsPurchaseId" IN
      (SELECT "id" FROM "pos_goods_purchases" WHERE "storeId" = ${input.storeId} AND "shoppingRequestId" = ${input.requestId}))
    ORDER BY "id" FOR UPDATE`;
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_batch_operations"
    WHERE "storeId" = ${input.storeId} AND "id" IN (
      SELECT "stockBundleId" FROM "pos_inventory_inbound_receipts"
      WHERE "storeId" = ${input.storeId} AND "stockBundleId" IS NOT NULL AND
        ("shoppingRequestId" = ${input.requestId} OR "goodsPurchaseId" IN
          (SELECT "id" FROM "pos_goods_purchases" WHERE "storeId" = ${input.storeId} AND "shoppingRequestId" = ${input.requestId}))
    ) ORDER BY "id" FOR UPDATE`;

  const sourceKeys = new Set<string>();
  for (const change of input.changes) {
    const key = change.receiptLineId ? `line:${change.receiptLineId}` : `new:${change.goodsPurchaseItemId}`;
    if (sourceKeys.has(key)) throw new Error("Sumber penerimaan tidak boleh dikoreksi dua kali.");
    sourceKeys.add(key);
    if (![change.oldReceivedQty, change.newReceivedQty].every((value) => Number.isFinite(value) && value >= 0)) {
      throw new Error("Jumlah penerimaan tidak valid.");
    }
  }
  if (!input.changes.length) return;

  const itemIds = [...new Set(input.changes.map((change) => change.goodsPurchaseItemId))];
  const pending = await tx.inventoryInboundReceiptLine.findFirst({
    where: {
      goodsPurchaseItemId: { in: itemIds },
      receipt: { storeId: input.storeId, status: { in: ["SUBMITTED", "NEEDS_REVISION"] } },
    }, select: { id: true },
  });
  if (pending) throw new Error("Masih ada penerimaan yang menunggu persetujuan. Selesaikan penerimaan terlebih dahulu.");

  const items = await tx.goodsPurchaseItem.findMany({
    where: { id: { in: itemIds }, goodsPurchase: { storeId: input.storeId, shoppingRequestId: input.requestId, status: { not: "CANCELLED" } } },
    select: { id: true, productId: true, shoppingRequestItemId: true, latestUnitPrice: true, unitMultiplierSnapshot: true },
  });
  if (items.length !== itemIds.length) throw new Error("Barang pembelian tidak tersedia.");
  const itemById = new Map(items.map((item) => [item.id, item]));
  const productIds = [...new Set(input.changes.map((change) => change.productId))].sort();
  const hints = await tx.product.findMany({ where: { storeId: input.storeId, id: { in: productIds } }, select: { id: true, stockGroupId: true } });
  if (hints.length !== productIds.length) throw new Error("Produk tidak tersedia di toko ini.");
  const groupIds = [...new Set(hints.flatMap((product) => product.stockGroupId ? [product.stockGroupId] : []))].sort();
  const locks = await lockStockMutationRows(tx, { storeId: input.storeId, productIds, stockGroupIds: groupIds });
  if (locks.lockedProductIds.length !== productIds.length || locks.lockedStockGroupIds.length !== groupIds.length) {
    throw new Error("Produk atau grup stok berubah. Muat ulang dan coba lagi.");
  }
  const products = await tx.product.findMany({
    where: { storeId: input.storeId, id: { in: productIds } },
    select: { id: true, stock: true, stockGroupId: true, unitMultiplierToBase: true, conversionNeedsReview: true, stockGroup: { select: { id: true, baseStock: true } } },
  });
  const productById = new Map(products.map((product) => [product.id, product]));
  for (const hint of hints) {
    if (productById.get(hint.id)?.stockGroupId !== hint.stockGroupId) throw new Error("Grup stok berubah. Muat ulang dan coba lagi.");
  }

  const lineIds = input.changes.flatMap((change) => change.receiptLineId ? [change.receiptLineId] : []);
  const receiptLines = await tx.inventoryInboundReceiptLine.findMany({
    where: { id: { in: lineIds }, receipt: { storeId: input.storeId, status: "APPROVED", goodsPurchase: { storeId: input.storeId, shoppingRequestId: input.requestId } } },
    select: {
      id: true, productId: true, shoppingRequestItemId: true, goodsPurchaseItemId: true, status: true, receivedQuantity: true, inventoryLogId: true,
      receipt: { select: { id: true, goodsPurchaseId: true, createdAt: true, stockBundle: { select: { id: true, type: true, status: true, summary: true, items: { select: { productId: true, inventoryLogId: true, afterSnapshot: true } } } } } },
    },
  });
  if (receiptLines.length !== lineIds.length) throw new Error("Penerimaan asal tidak tersedia atau telah berubah.");
  const receiptById = new Map(receiptLines.map((line) => [line.id, line]));
  const prior = await tx.shoppingRequestCorrectionMovement.findMany({
    where: { correction: { storeId: input.storeId, shoppingRequestId: input.requestId }, OR: [{ receiptLineId: { in: lineIds } }, { receiptLineId: null, goodsPurchaseItemId: { in: itemIds } }] },
    select: { receiptLineId: true, goodsPurchaseItemId: true, oldReceivedQty: true, newReceivedQty: true, stockGroupId: true, baseDelta: true, details: true },
  });

  const prepared: Array<{ change: CorrectionStockChange; multiplier: number; stockGroupId: string | null; unitCost: Prisma.Decimal; sourceLogId: string | null; delta: number }> = [];
  const stockInputs: Parameters<typeof planCorrectionStock>[0] = [];
  for (const change of input.changes) {
    const item = itemById.get(change.goodsPurchaseItemId);
    const product = productById.get(change.productId);
    if (!item || !product || item.productId !== change.productId || item.shoppingRequestItemId !== change.shoppingRequestItemId) {
      throw new Error("Barang pembelian berubah. Muat ulang dan coba lagi.");
    }
    const multiplier = product.stockGroupId ? product.unitMultiplierToBase : 1;
    if (product.conversionNeedsReview || !Number.isFinite(multiplier) || multiplier <= 0 ||
        (product.stockGroupId && !product.stockGroup)) throw new Error("Konversi satuan stok tidak dapat dipastikan.");
    let originalQty = 0;
    let sourceLogId: string | null = null;
    let unitCost = item.latestUnitPrice;
    if (change.receiptLineId) {
      const line = receiptById.get(change.receiptLineId);
      if (!line || line.productId !== change.productId || line.goodsPurchaseItemId !== change.goodsPurchaseItemId ||
          line.shoppingRequestItemId !== change.shoppingRequestItemId) throw new Error("Sumber penerimaan tidak cocok dengan barang.");
      originalQty = getInboundStockQuantity({ status: line.status, receivedQuantity: line.receivedQuantity });
      sourceLogId = line.inventoryLogId;
      if (originalQty > 0) {
        const bundle = line.receipt.stockBundle;
        const summary = asRecord(bundle?.summary);
        if (!bundle || bundle.type !== "INBOUND_RECEIPT" || !["COMMITTED", "UNDO_BLOCKED"].includes(bundle.status) ||
            summary?.source !== "INBOUND_RECEIPT" || summary.receiptId !== line.receipt.id || summary.goodsPurchaseId !== line.receipt.goodsPurchaseId || !sourceLogId) {
          throw new Error("Riwayat stok penerimaan tidak dapat dipastikan.");
        }
        const canonical = bundle.items.filter((entry) => {
          const impact = asRecord(asRecord(entry.afterSnapshot)?.inboundReceiptImpact);
          return impact?.kind === "CANONICAL" && impact.receiptLineId === line.id;
        });
        const entry = canonical[0];
        const impact = asRecord(asRecord(entry?.afterSnapshot)?.inboundReceiptImpact);
        if (canonical.length !== 1 || entry.productId !== change.productId || entry.inventoryLogId !== sourceLogId ||
            impact?.stockGroupId !== product.stockGroupId || typeof impact?.delta !== "number" || typeof impact.baseDelta !== "number" ||
            !sameQuantity(impact.delta, originalQty) || !sameQuantity(impact.baseDelta, originalQty * multiplier)) {
          throw new Error("Riwayat atau konversi stok penerimaan tidak dapat dipastikan.");
        }
        const log = await tx.inventoryLog.findFirst({ where: { id: sourceLogId, productId: change.productId, type: "IN", reason: "RESTOCK", status: "APPROVED" }, select: { quantity: true, unitCost: true } });
        if (!log || !sameQuantity(log.quantity, originalQty)) throw new Error("Riwayat stok penerimaan tidak dapat dipastikan.");
        unitCost = log.unitCost ?? item.latestUnitPrice;
        if (product.stockGroupId) {
          const changed = await tx.productStockGroupActivity.findFirst({ where: { stockGroupId: product.stockGroupId, type: "CONVERSION_RATE_CHANGED", createdAt: { gte: line.receipt.createdAt } }, select: { id: true } });
          if (changed) throw new Error("Konversi grup stok berubah setelah penerimaan. Periksa stok secara manual.");
        }
      } else if (sourceLogId) {
        throw new Error("Riwayat stok penerimaan tidak dapat dipastikan.");
      }
    }
    const previous = prior.filter((entry) => change.receiptLineId
      ? entry.receiptLineId === change.receiptLineId
      : entry.receiptLineId === null && entry.goodsPurchaseItemId === change.goodsPurchaseItemId);
    for (const entry of previous) {
      const details = asRecord(entry.details);
      const historicalMultiplier = typeof details?.multiplier === "number" ? details.multiplier : Number(details?.multiplier ?? 1);
      if (entry.stockGroupId !== product.stockGroupId ||
          !sameQuantity(historicalMultiplier, multiplier) ||
          !sameQuantity(Number(entry.baseDelta), (Number(entry.newReceivedQty) - Number(entry.oldReceivedQty)) * historicalMultiplier) ) {
        throw new Error("Riwayat konversi stok koreksi berubah. Periksa stok secara manual.");
      }
    }
    const effective = previous.reduce((sum, entry) => sum.plus(String(entry.newReceivedQty)).minus(String(entry.oldReceivedQty)), new Prisma.Decimal(String(originalQty)));
    if (!sameQuantity(effective.toNumber(), change.oldReceivedQty)) throw new Error("Penerimaan berubah. Muat ulang dan coba lagi.");
    const delta = new Prisma.Decimal(String(change.newReceivedQty)).minus(String(change.oldReceivedQty)).toNumber();
    prepared.push({ change, multiplier, stockGroupId: product.stockGroupId, unitCost, sourceLogId, delta });
    stockInputs.push({ productId: product.id, stockGroupId: product.stockGroupId, oldQty: change.oldReceivedQty, newQty: change.newReceivedQty, baseMultiplier: multiplier, availableBaseStock: product.stockGroup?.baseStock ?? product.stock });
  }

  for (const movement of planCorrectionStock(stockInputs)) {
    const result = movement.stockGroupId
      ? await tx.productStockGroup.updateMany({ where: { id: movement.stockGroupId, storeId: input.storeId, ...(movement.baseDelta < 0 ? { baseStock: { gte: -movement.baseDelta } } : {}) }, data: { baseStock: { increment: movement.baseDelta } } })
      : await tx.product.updateMany({ where: { id: movement.productId, storeId: input.storeId, stockGroupId: null, ...(movement.baseDelta < 0 ? { stock: { gte: -movement.baseDelta } } : {}) }, data: { stock: { increment: movement.baseDelta } } });
    if (result.count !== 1) throw new Error("Stok tidak cukup atau telah berubah. Muat ulang dan coba lagi.");
  }
  for (const entry of prepared) {
    if (entry.delta === 0) continue;
    const baseDelta = new Prisma.Decimal(String(entry.delta)).mul(String(entry.multiplier)).toNumber();
    const log = await tx.inventoryLog.create({ data: {
      productId: entry.change.productId, type: entry.delta > 0 ? "IN" : "OUT", reason: "RESTOCK", quantity: Math.abs(entry.delta),
      note: `Koreksi daftar belanja: ${input.reason}`, createdBy: input.actor.id, person: input.actor.name,
      status: "APPROVED", approvedBy: input.actor.id, approverName: input.actor.name, decidedAt: new Date(),
      unitCost: entry.unitCost, stockGroupIdSnapshot: entry.stockGroupId, unitMultiplierSnapshot: entry.multiplier,
      stockBaseDelta: baseDelta, sourceTransactionRef: `shopping-request:${input.requestId}`,
    }, select: { id: true } });
    await tx.shoppingRequestCorrectionMovement.create({ data: {
      correctionId: input.correctionId, productId: entry.change.productId, shoppingRequestItemId: entry.change.shoppingRequestItemId,
      goodsPurchaseItemId: entry.change.goodsPurchaseItemId, receiptLineId: entry.change.receiptLineId, inventoryLogId: log.id,
      stockGroupId: entry.stockGroupId, oldReceivedQty: entry.change.oldReceivedQty, newReceivedQty: entry.change.newReceivedQty,
      baseDelta, details: { sourceInventoryLogId: entry.sourceLogId, multiplier: entry.multiplier },
    } });
  }
}
