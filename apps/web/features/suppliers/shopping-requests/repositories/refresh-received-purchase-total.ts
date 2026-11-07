import type { Prisma } from "@pos/db";
import { calculateReceivedPurchaseTotal } from "./received-quantity-repository";
import { loadCorrectionPaymentState } from "./shopping-request-correction-payment-state";
import { resizeCorrectionSchedule } from "./shopping-request-correction-schedule";

/** Refreshes only purchases whose correction preserved their payment sources. */
export async function refreshReceivedPurchaseTotal(
  tx: Prisma.TransactionClient,
  input: { storeId: string; purchaseId: string },
): Promise<void> {
  const purchase = await tx.goodsPurchase.findFirst({
    where: { id: input.purchaseId, storeId: input.storeId, status: "APPROVED" },
    select: {
      id: true,
      shoppingRequestId: true,
      totalBasis: true,
      paymentMethod: true,
      payments: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, method: true, amount: true, dueDate: true, note: true } },
      expense: { select: { id: true, storeId: true, deletedAt: true } },
      shoppingRequest: { select: { expense: { select: { id: true, storeId: true, deletedAt: true } } } },
      supplierPayable: { select: { id: true, storeId: true } },
    },
  });
  if (!purchase) throw new Error("Pembelian tidak tersedia.");
  const audit = await tx.shoppingRequestCorrection.findFirst({
    where: { storeId: input.storeId, shoppingRequestId: purchase.shoppingRequestId },
    select: { id: true },
  });
  if (!audit) {
    if (purchase.totalBasis === "ORDERED") return;
    throw new Error("Riwayat koreksi pembayaran tidak tersedia. Periksa pembelian secara manual.");
  }
  if (purchase.totalBasis === "ORDERED") {
    const received = await tx.inventoryInboundReceipt.count({ where: { goodsPurchaseId: purchase.id, storeId: input.storeId, status: "APPROVED" } });
    if (!received) return;
  }

  // Locks the expense and payable and validates the saved source/allocation snapshot
  // before the expense amount can change.
  await loadCorrectionPaymentState(tx, input);
  if (purchase.totalBasis === "ORDERED") await tx.goodsPurchase.update({ where: { id: purchase.id }, data: { totalBasis: "RECEIVED" } });
  const { receivedTotal } = await calculateReceivedPurchaseTotal(tx, input);
  const expense = purchase.expense ?? purchase.shoppingRequest.expense;
  if ((!expense && receivedTotal !== "0.00") || (expense && (expense.deletedAt || expense.storeId !== input.storeId))) {
    throw new Error("Pengeluaran pembelian tidak tersedia di toko ini.");
  }
  if (purchase.supplierPayable && purchase.supplierPayable.storeId !== input.storeId) {
    throw new Error("Utang pembelian tidak tersedia di toko ini.");
  }
  if (expense && purchase.paymentMethod === "GIRO" && !purchase.supplierPayable) {
    throw new Error("Utang Giro tidak tersedia. Periksa pembayaran secara manual.");
  }

  const previousSchedule = purchase.payments.map(row => ({ method: row.method, amount: row.amount.toFixed(2), dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null, note: row.note }));
  const schedule = resizeCorrectionSchedule(previousSchedule, receivedTotal);
  for (const [index, row] of schedule.entries()) await tx.goodsPurchasePayment.update({ where: { id: purchase.payments[index].id }, data: { amount: row.amount } });
  if (JSON.stringify(previousSchedule) !== JSON.stringify(schedule)) {
    const receipt = await tx.inventoryInboundReceipt.findFirst({ where: { goodsPurchaseId: purchase.id, storeId: input.storeId, status: "APPROVED", stockBundleId: { not: null } }, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], select: { stockBundle: { select: { id: true, summary: true } } } });
    if (receipt?.stockBundle) {
      const summary = receipt.stockBundle.summary && typeof receipt.stockBundle.summary === "object" && !Array.isArray(receipt.stockBundle.summary) ? receipt.stockBundle.summary : {};
      await tx.batchOperation.update({ where: { id: receipt.stockBundle.id }, data: { summary: { ...summary, paymentScheduleAdjustment: { policy: "LATEST_GIRO_FIRST", before: previousSchedule, after: schedule } } } });
    }
  }
  await tx.goodsPurchase.update({ where: { id: purchase.id }, data: { totalAmount: receivedTotal } });
  if (expense) {
    const updatedExpense = await tx.expense.updateMany({ where: { id: expense.id, storeId: input.storeId, deletedAt: null }, data: { amount: receivedTotal } });
    if (updatedExpense.count !== 1) throw new Error("Pengeluaran pembelian berubah. Muat ulang dan coba lagi.");
  }
  if (purchase.supplierPayable) {
    const updatedPayable = await tx.supplierPayable.updateMany({ where: { id: purchase.supplierPayable.id, storeId: input.storeId, goodsPurchaseId: purchase.id }, data: { amount: receivedTotal } });
    if (updatedPayable.count !== 1) throw new Error("Utang pembelian berubah. Muat ulang dan coba lagi.");
  }
}
