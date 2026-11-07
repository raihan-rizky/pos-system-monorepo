import type { Prisma } from "@pos/db";
import { getInboundStockQuantity } from "@/features/inventory-management/helpers/inbound-receipt-rules";
import { calculateCorrectionTotal, effectiveReceivedQuantities } from "../helpers/shopping-request-correction";

export async function loadCorrectedReceiptTotals(
  tx: Prisma.TransactionClient,
  storeId: string,
  items: Array<{ id: string; purchaseId: string; requestId: string }>,
): Promise<Map<string, number>> {
  const byId = new Map(items.map((item) => [item.id, item]));
  const totals = new Map(items.map((item) => [item.id, 0]));
  if (!items.length) return totals;
  const ids = [...byId.keys()];
  const [lines, movements] = await Promise.all([
    tx.inventoryInboundReceiptLine.findMany({
      where: { goodsPurchaseItemId: { in: ids }, receipt: { storeId, status: "APPROVED" } },
      select: {
        id: true, goodsPurchaseItemId: true, status: true, receivedQuantity: true, inventoryLogId: true,
        receipt: { select: { goodsPurchaseId: true, stockBundle: { select: { type: true, status: true } } } },
      },
    }),
    tx.shoppingRequestCorrectionMovement.findMany({
      where: { goodsPurchaseItemId: { in: ids }, correction: { storeId } },
      select: { goodsPurchaseItemId: true, receiptLineId: true, oldReceivedQty: true, newReceivedQty: true, correction: { select: { shoppingRequestId: true } } },
    }),
  ]);
  const sources = lines.map((line) => {
    const item = line.goodsPurchaseItemId ? byId.get(line.goodsPurchaseItemId) : null;
    if (!item || item.purchaseId !== line.receipt.goodsPurchaseId) throw new Error("Sumber penerimaan tidak sesuai dengan pembelian.");
    const receivedQty = getInboundStockQuantity({ status: line.status, receivedQuantity: line.receivedQuantity });
    if (receivedQty > 0 && (!line.inventoryLogId || line.receipt.stockBundle?.type !== "INBOUND_RECEIPT" ||
        !["COMMITTED", "UNDO_BLOCKED"].includes(line.receipt.stockBundle.status))) {
      throw new Error("Sumber stok penerimaan telah dibalik atau tidak dapat dipastikan.");
    }
    return { receiptLineId: line.id, purchaseItemId: item.id, receivedQty };
  });
  const changes = movements.map((movement) => {
    const item = movement.goodsPurchaseItemId ? byId.get(movement.goodsPurchaseItemId) : null;
    if (!item || item.requestId !== movement.correction.shoppingRequestId) throw new Error("Sumber koreksi tidak sesuai dengan daftar belanja.");
    return { receiptLineId: movement.receiptLineId, purchaseItemId: item.id, oldReceivedQty: movement.oldReceivedQty, newReceivedQty: movement.newReceivedQty };
  });
  for (const total of effectiveReceivedQuantities(sources, changes)) totals.set(total.purchaseItemId, total.receivedQty);
  return totals;
}

export async function calculateReceivedPurchaseTotal(
  tx: Prisma.TransactionClient,
  input: { storeId: string; purchaseId: string },
): Promise<{ previousTotal: string; receivedTotal: string }> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_goods_purchases"
    WHERE "id" = ${input.purchaseId} AND "storeId" = ${input.storeId} AND "status" = 'APPROVED'
    FOR UPDATE
  `;
  if (locked.length !== 1) throw new Error("Pembelian tidak tersedia.");
  const purchase = await tx.goodsPurchase.findFirst({
    where: { id: input.purchaseId, storeId: input.storeId, status: "APPROVED" },
    select: { id: true, shoppingRequestId: true, totalBasis: true, totalAmount: true, items: { select: { id: true, latestUnitPrice: true } } },
  });
  if (!purchase || purchase.totalBasis !== "RECEIVED") throw new Error("Dasar total pembelian belum menggunakan jumlah diterima.");
  const quantities = await loadCorrectedReceiptTotals(tx, input.storeId, purchase.items.map((item) => ({
    id: item.id, purchaseId: purchase.id, requestId: purchase.shoppingRequestId,
  })));
  return {
    previousTotal: purchase.totalAmount.toFixed(2),
    receivedTotal: calculateCorrectionTotal(purchase.items.map((item) => ({ receivedQty: quantities.get(item.id) ?? 0, unitPrice: item.latestUnitPrice.toFixed(2) }))),
  };
}
