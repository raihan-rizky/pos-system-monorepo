import type { Prisma } from "@pos/db";
import { createHash } from "node:crypto";
import type { CorrectionLine, CorrectionPaymentSchedule } from "../types/shopping-request-correction";
import type { CorrectionPaymentAllocation, CorrectionPaymentSource } from "../helpers/shopping-request-correction";
import { loadCorrectionPaymentState } from "./shopping-request-correction-payment-state";
import { loadCorrectionReceiptSources } from "./shopping-request-correction-receipt-sources";
import { ShoppingRequestCorrectionError } from "../services/shopping-request-correction-error";

const productSelect = {
  id: true, storeId: true, name: true, sku: true, unit: true, isActive: true,
  stock: true, stockGroupId: true, unitMultiplierToBase: true, conversionNeedsReview: true,
  costPrice: true, price: true, updatedAt: true,
  stockGroup: { select: { id: true, storeId: true, baseStock: true, baseUnit: true, updatedAt: true } },
} satisfies Prisma.ProductSelect;

type EditorItem = CorrectionLine & {
  productName: string;
  sku: string;
  catalogCostPrice: string | null;
  catalogSalePrice: string;
  catalogUpdatedAt: string;
};

export type ShoppingRequestCorrectionEditor = {
  requestId: string;
  purchaseId: string;
  version: string;
  header: { name: string; number: string; businessDate: string; supplierId: string | null; requestedByName: string | null; note: string | null };
  items: EditorItem[];
  payment: { method: "TRANSFER" | "GIRO" | null; dueDate: string | null; schedule?: CorrectionPaymentSchedule[]; sources: CorrectionPaymentSource[]; allocations: CorrectionPaymentAllocation[] };
  pendingReceipts: Array<{ id: string; status: string; itemIds: string[] }>;
};

export async function loadShoppingRequestCorrectionEditor(
  tx: Prisma.TransactionClient,
  input: { storeId: string; requestId: string },
): Promise<ShoppingRequestCorrectionEditor> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_shopping_requests"
    WHERE "id" = ${input.requestId} AND "storeId" = ${input.storeId} AND "status" <> 'CANCELLED'
    FOR UPDATE
  `;
  if (locked.length !== 1) throw new ShoppingRequestCorrectionError("Daftar belanja tidak tersedia di toko ini.", 404);
  const request = await tx.shoppingRequest.findFirst({
    where: { id: input.requestId, storeId: input.storeId, status: { not: "CANCELLED" } },
    select: {
      id: true, status: true, name: true, number: true, businessDate: true, supplierId: true,
      requestedByName: true, note: true, createdAt: true, updatedAt: true,
      expense: { select: { id: true, storeId: true, deletedAt: true, amount: true, occurredAt: true, updatedAt: true } },
      items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: {
        id: true, productId: true, productName: true, unit: true, requestedQty: true, approvedQty: true,
        costPriceSnapshot: true, removedAt: true, updatedAt: true, product: { select: productSelect },
      } },
      corrections: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true } },
    },
  });
  if (!request) throw new ShoppingRequestCorrectionError("Daftar belanja tidak tersedia di toko ini.", 404);
  const lockedPurchases = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_goods_purchases"
    WHERE "storeId" = ${input.storeId} AND "shoppingRequestId" = ${request.id} AND "status" = 'APPROVED'
    ORDER BY "id" FOR UPDATE
  `;
  if (lockedPurchases.length !== 1) throw new ShoppingRequestCorrectionError("Pembelian aktif tidak dapat dipastikan. Periksa daftar secara manual.", 409);
  const purchases = await tx.goodsPurchase.findMany({
    where: { storeId: input.storeId, shoppingRequestId: request.id, status: "APPROVED" },
    orderBy: { id: "asc" },
    select: {
      id: true, status: true, totalAmount: true, totalBasis: true, paymentMethod: true, paymentDueDate: true, updatedAt: true,
      payments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { method: true, amount: true, dueDate: true, note: true } },
      expense: { select: { id: true, storeId: true, deletedAt: true, amount: true, occurredAt: true, updatedAt: true } },
      supplierPayable: { select: { id: true, storeId: true, amount: true, debtDate: true, dueDate: true, giroHistoryVerifiedAt: true } },
      items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: {
        id: true, shoppingRequestItemId: true, productId: true, productNameSnapshot: true, skuSnapshot: true,
        unitSnapshot: true, quantity: true, latestUnitPrice: true, removedAt: true, updatedAt: true,
        product: { select: productSelect },
      } },
      inboundReceipts: { orderBy: { id: "asc" }, select: {
        id: true, status: true, updatedAt: true, stockBundleId: true,
        stockBundle: { select: { status: true } },
        lines: { orderBy: { id: "asc" }, select: { id: true, goodsPurchaseItemId: true, status: true, receivedQuantity: true, reviewStatus: true, updatedAt: true } },
      } },
    },
  });
  if (purchases.length !== 1) throw new ShoppingRequestCorrectionError("Pembelian aktif tidak dapat dipastikan. Periksa daftar secara manual.", 409);
  const purchase = purchases[0];
  const receiptSources = await loadCorrectionReceiptSources(tx, { storeId: input.storeId, purchaseId: purchase.id });
  const requestItems = new Map(request.items.map((item) => [item.id, item]));
  const receiptByPurchaseItem = new Map(receiptSources.map((source) => [source.purchaseItemId, source]));
  const usedRequestItems = new Set<string>();
  const items: EditorItem[] = [];
  for (const item of purchase.items) {
    if (item.removedAt) continue;
    const requestItem = item.shoppingRequestItemId ? requestItems.get(item.shoppingRequestItemId) : null;
    if ((item.shoppingRequestItemId && (!requestItem || requestItem.removedAt || requestItem.productId !== item.productId)) ||
        item.product.storeId !== input.storeId || (item.product.stockGroup && item.product.stockGroup.storeId !== input.storeId)) {
      throw new Error("Barang pembelian tidak sesuai dengan daftar atau toko.");
    }
    if (requestItem) usedRequestItems.add(requestItem.id);
    items.push({
      clientLineKey: `purchase:${item.id}`, requestItemId: requestItem?.id ?? null, purchaseItemId: item.id,
      productId: item.productId, productName: item.productNameSnapshot, sku: item.skuSnapshot, unit: item.unitSnapshot,
      requestedQty: requestItem?.requestedQty ?? item.quantity, approvedQty: requestItem?.approvedQty ?? item.quantity,
      orderedQty: item.quantity, unitPrice: item.latestUnitPrice.toFixed(2), receipts: receiptByPurchaseItem.get(item.id)?.receipts ?? [],
      catalogCostPrice: item.product.costPrice?.toFixed(2) ?? null, catalogSalePrice: item.product.price.toFixed(2), catalogUpdatedAt: item.product.updatedAt.toISOString(),
    });
  }
  for (const item of request.items) {
    if (item.removedAt || usedRequestItems.has(item.id)) continue;
    if (item.product.storeId !== input.storeId || items.some((entry) => entry.productId === item.productId)) {
      throw new Error("Barang daftar tidak sesuai dengan pembelian atau toko.");
    }
    items.push({
      clientLineKey: `request:${item.id}`, requestItemId: item.id, purchaseItemId: null, productId: item.productId,
      productName: item.productName, sku: item.product.sku, unit: item.unit, requestedQty: item.requestedQty,
      approvedQty: item.approvedQty, orderedQty: 0, unitPrice: (item.costPriceSnapshot ?? item.product.costPrice)?.toFixed(2) ?? "0.00", receipts: [],
      catalogCostPrice: item.product.costPrice?.toFixed(2) ?? null, catalogSalePrice: item.product.price.toFixed(2), catalogUpdatedAt: item.product.updatedAt.toISOString(),
    });
  }
  const expense = purchase.expense ?? request.expense;
  if ((expense && (expense.storeId !== input.storeId || expense.deletedAt)) ||
      (purchase.supplierPayable && purchase.supplierPayable.storeId !== input.storeId)) {
    throw new Error("Riwayat pembayaran tidak tersedia di toko ini.");
  }
  const paymentState = expense || purchase.supplierPayable || request.corrections.length
    ? await loadCorrectionPaymentState(tx, { storeId: input.storeId, purchaseId: purchase.id })
    : { sources: [], allocations: [] };
  const pendingReceipts = purchase.inboundReceipts.filter((receipt) => ["SUBMITTED", "NEEDS_REVISION"].includes(receipt.status)).map((receipt) => ({
    id: receipt.id, status: receipt.status, itemIds: receipt.lines.flatMap((line) => line.goodsPurchaseItemId ? [line.goodsPurchaseItemId] : []),
  }));
  const businessDate = request.businessDate?.toISOString().slice(0, 10) ?? new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(request.createdAt);
  const version = createHash("sha256").update(JSON.stringify({ request, purchase, receiptSources, paymentState })).digest("hex");
  return {
    requestId: request.id, purchaseId: purchase.id, version,
    header: { name: request.name, number: request.number, businessDate, supplierId: request.supplierId, requestedByName: request.requestedByName, note: request.note },
    items, payment: { method: purchase.paymentMethod, dueDate: purchase.paymentDueDate?.toISOString().slice(0, 10) ?? null,
      schedule: purchase.payments.map(row => ({ ...row, amount: row.amount.toFixed(2), dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null })),
      sources: paymentState.sources, allocations: paymentState.allocations },
    pendingReceipts,
  };
}
