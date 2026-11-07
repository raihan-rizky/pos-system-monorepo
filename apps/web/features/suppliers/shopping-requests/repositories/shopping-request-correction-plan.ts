import { Prisma } from "@pos/db";
import { createHash } from "node:crypto";
import { calculateCorrectionTotal, planCorrectionPayments, planCorrectionStock, summarizeCorrectionPayment } from "../helpers/shopping-request-correction";
import { parseShoppingRequestCorrection } from "../helpers/shopping-request-correction-input";
import { planCorrectionReceiptChanges } from "../helpers/shopping-request-correction-lines";
import type { CorrectionPreview, ShoppingRequestCorrectionInput } from "../types/shopping-request-correction";
import { ShoppingRequestCorrectionError } from "../services/shopping-request-correction-error";
import { loadShoppingRequestCorrectionEditor } from "./shopping-request-correction-editor";
import { resolveCorrectionSchedule } from "./shopping-request-correction-schedule";
import { planCorrectionCatalog } from "./shopping-request-correction-catalog";

export async function planShoppingRequestCorrection(
  tx: Prisma.TransactionClient,
  input: { storeId: string; requestId: string; data: ShoppingRequestCorrectionInput },
) {
  const data = parseShoppingRequestCorrection(input.data);
  const editor = await loadShoppingRequestCorrectionEditor(tx, input);
  if (data.expectedVersion !== editor.version) throw new ShoppingRequestCorrectionError("Data daftar belanja berubah. Muat ulang dan coba lagi.", 409);
  if (editor.pendingReceipts.length) throw new ShoppingRequestCorrectionError("Masih ada penerimaan yang menunggu persetujuan. Selesaikan penerimaan terlebih dahulu.", 409);

  const original = editor.items.flatMap((item) => item.purchaseItemId ? [{
    requestItemId: item.requestItemId, purchaseItemId: item.purchaseItemId, productId: item.productId, receipts: item.receipts,
  }] : []);
  for (const item of data.items) {
    if (!item.purchaseItemId && item.requestItemId && !editor.items.some((old) => old.requestItemId === item.requestItemId && !old.purchaseItemId && old.productId === item.productId)) {
      throw new ShoppingRequestCorrectionError("Barang daftar berubah. Muat ulang dan coba lagi.", 409);
    }
  }
  const receiptChanges = planCorrectionReceiptChanges(original, data.items);
  const paymentPlan = planCorrectionPayments(editor.payment.sources, data.payment.allocations, data.payment.corrections);
  const purchase = await tx.goodsPurchase.findFirst({
    where: { id: editor.purchaseId, storeId: input.storeId, status: "APPROVED" },
    select: { totalAmount: true, totalBasis: true, expense: { select: { occurredAt: true } }, shoppingRequest: { select: { expense: { select: { occurredAt: true } } } } },
  });
  if (!purchase) throw new ShoppingRequestCorrectionError("Pembelian tidak tersedia.", 409);
  const useReceived = purchase.totalBasis === "RECEIVED" || editor.items.some((item) => item.receipts.length > 0) ||
    data.items.some((item) => item.receipts.some((receipt) => receipt.receivedQty > 0));
  const newTotal = calculateCorrectionTotal(data.items.map((item) => ({
    receivedQty: useReceived ? item.receipts.reduce((sum, receipt) => sum.plus(String(receipt.receivedQty)), new Prisma.Decimal(0)).toNumber() : item.orderedQty,
    unitPrice: item.unitPrice,
  })));
  const payment = summarizeCorrectionPayment(newTotal, paymentPlan.paid);
  const schedule = resolveCorrectionSchedule({ total: newTotal, schedule: data.payment.schedule, previous: editor.payment.schedule ?? [], method: data.payment.method, dueDate: data.payment.dueDate });
  if (data.payment.schedule) data.payment = { ...data.payment, schedule,
    method: schedule.length && schedule.every(row => row.method === schedule[0].method) ? schedule[0].method : null,
    dueDate: schedule.filter(row => row.method === "GIRO").map(row => row.dueDate!).sort()[0] ?? null };

  const productIds = [...new Set([...data.items.map((item) => item.productId), ...receiptChanges.existing.map((item) => item.productId), ...data.catalog.map((item) => item.productId)])];
  const products = await tx.product.findMany({
    where: { storeId: input.storeId, id: { in: productIds } },
    select: { id: true, name: true, unit: true, costPrice: true, price: true, stock: true, isActive: true, stockGroupId: true, unitMultiplierToBase: true, conversionNeedsReview: true, updatedAt: true,
      stockGroup: { select: { storeId: true, baseStock: true, baseUnit: true } } },
  });
  if (products.length !== productIds.length) throw new ShoppingRequestCorrectionError("Produk tidak tersedia di toko ini.", 409);
  const productById = new Map(products.map((product) => [product.id, product]));
  for (const item of data.items) {
    const product = productById.get(item.productId)!;
    if ((!item.purchaseItemId && !product.isActive) || product.conversionNeedsReview || (product.stockGroup && product.stockGroup.storeId !== input.storeId)) {
      throw new ShoppingRequestCorrectionError("Produk atau konversi satuan tidak dapat digunakan. Periksa kembali barang.", 409);
    }
  }
  for (const choice of data.catalog) {
    const product = productById.get(choice.productId)!;
    if (!data.items.some((item) => item.productId === choice.productId) || product.updatedAt.toISOString() !== choice.expectedUpdatedAt) {
      throw new ShoppingRequestCorrectionError("Harga katalog berubah. Muat ulang dan coba lagi.", 409);
    }
  }
  const stockLines = [
    ...receiptChanges.existing.map((change) => ({ productId: change.productId, oldQty: change.oldReceivedQty, newQty: change.newReceivedQty })),
    ...receiptChanges.added.map((change) => ({ productId: change.productId, oldQty: 0, newQty: change.receivedQty })),
  ].map((change) => {
    const product = productById.get(change.productId)!;
    return { ...change, stockGroupId: product.stockGroupId, baseMultiplier: product.stockGroupId ? product.unitMultiplierToBase : 1,
      availableBaseStock: product.stockGroup?.baseStock ?? product.stock };
  });
  const stock = planCorrectionStock(stockLines).map((movement) => {
    const product = productById.get(movement.productId)!;
    return { productId: movement.productId, baseDelta: movement.baseDelta, unit: product.stockGroup?.baseUnit ?? product.unit };
  });
  const changes: CorrectionPreview["changes"] = [];
  const addChange = (field: string, before: unknown, after: unknown) => {
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ field, before, after });
  };
  for (const key of ["name", "number", "businessDate", "supplierId", "requestedByName", "note"] as const) {
    addChange(`daftar.${key}`, editor.header[key], data.header[key]);
  }
  for (const old of editor.items) {
    const item = data.items.find((entry) => old.purchaseItemId ? entry.purchaseItemId === old.purchaseItemId : entry.requestItemId === old.requestItemId);
    if (!item) { addChange(`barang.${old.productName}`, old, null); continue; }
    for (const key of ["unit", "requestedQty", "approvedQty", "orderedQty", "unitPrice", "receipts"] as const) addChange(`barang.${old.productName}.${key}`, old[key], item[key]);
  }
  for (const item of data.items) {
    if (!editor.items.some((old) => item.purchaseItemId ? old.purchaseItemId === item.purchaseItemId : item.requestItemId && old.requestItemId === item.requestItemId)) addChange("barang.baru", null, item);
  }
  const catalogPlan = await planCorrectionCatalog(tx, input.storeId, data.catalog);
  changes.push(...catalogPlan.changes);
  addChange("pembayaran.metode", editor.payment.method, data.payment.method);
  addChange("pembayaran.jadwal", editor.payment.schedule ?? [], schedule);
  addChange("pembayaran.jatuhTempo", editor.payment.dueDate, data.payment.dueDate);
  const canonicalAllocations = (allocations: typeof editor.payment.allocations) => allocations.map((entry) => ({
    sourceKind: entry.sourceKind, paymentId: entry.paymentId, method: entry.method, amount: new Prisma.Decimal(entry.amount).toFixed(2),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  addChange("pembayaran.alokasi", canonicalAllocations(editor.payment.allocations), canonicalAllocations(paymentPlan.allocations));
  if (data.payment.corrections.length) addChange("pembayaran.rincian", editor.payment.sources, paymentPlan.sources);
  const expenseDate = purchase.expense?.occurredAt ?? purchase.shoppingRequest.expense?.occurredAt;
  const affectedDates = [...new Set([editor.header.businessDate, data.header.businessDate,
    ...(expenseDate ? [new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(expenseDate)] : []),
    ...data.payment.corrections.flatMap((entry) => [editor.payment.sources.find((source) => source.sourceKind === entry.sourceKind && source.paymentId === entry.paymentId)?.paidAt, entry.paidAt].filter((date): date is string => Boolean(date))),
  ])].sort();
  const version = createHash("sha256").update(JSON.stringify({
    editorVersion: editor.version,
    data: { ...data, expectedPreviewVersion: undefined },
    products: [...products].sort((a,b) => a.id.localeCompare(b.id)),
    catalogVersions: catalogPlan.versions,
  })).digest("hex");
  const preview: CorrectionPreview = { version, stock, oldTotal: purchase.totalAmount.toFixed(2), newTotal, paid: paymentPlan.paid, overpaid: payment.overpaid, affectedDates, changes };
  return { editor, data, receiptChanges, paymentPlan, useReceived, preview, catalogPlan };
}
