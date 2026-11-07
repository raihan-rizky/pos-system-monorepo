import { Prisma } from "@pos/db";
import { planCorrectionPayments, type CorrectionPaymentAllocation, type CorrectionPaymentSource } from "../helpers/shopping-request-correction";
import { readCorrectionPaymentSnapshot } from "./shopping-request-correction-payment-snapshot";
import { resolveCorrectionPaymentSources } from "./shopping-request-correction-payment-sources";

export async function loadCorrectionPaymentState(
  tx: Prisma.TransactionClient,
  input: { storeId: string; purchaseId: string; excludeCorrectionId?: string },
) {
  const lockedPurchase = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_goods_purchases"
    WHERE "id" = ${input.purchaseId} AND "storeId" = ${input.storeId} AND "status" = 'APPROVED'
    FOR UPDATE
  `;
  if (lockedPurchase.length !== 1) throw new Error("Pembelian tidak tersedia.");
  const purchase = await tx.goodsPurchase.findFirst({
    where: { id: input.purchaseId, storeId: input.storeId, status: "APPROVED" },
    select: { id: true, shoppingRequestId: true, paymentMethod: true, totalBasis: true, initialTransferAmount: true, initialTransferPaidAt: true,
      payments: { select: { method: true, amount: true } } },
  });
  if (!purchase) throw new Error("Pembelian tidak tersedia.");

  // The legacy correction form has one method/due date. Collapsing a mixed or
  // multi-Giro schedule would also mistake unpaid obligations for cash paid.
  const schedule = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_goods_purchase_payments"
    WHERE "goodsPurchaseId" = ${purchase.id}
    ORDER BY "id" FOR UPDATE
  `;

  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_expenses"
    WHERE "storeId" = ${input.storeId}
      AND ("goodsPurchaseId" = ${purchase.id} OR "shoppingRequestId" = ${purchase.shoppingRequestId})
    ORDER BY "id" FOR UPDATE
  `;
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_supplier_payables"
    WHERE "storeId" = ${input.storeId} AND "goodsPurchaseId" = ${purchase.id}
    ORDER BY "id" FOR UPDATE
  `;
  const [expenses, payable, latestCorrection] = await Promise.all([
    tx.expense.findMany({
      where: { storeId: input.storeId, OR: [{ goodsPurchaseId: purchase.id }, { shoppingRequestId: purchase.shoppingRequestId }] },
      select: { id: true, goodsPurchaseId: true, amount: true, occurredAt: true, deletedAt: true },
    }),
    tx.supplierPayable.findFirst({
      where: { storeId: input.storeId, goodsPurchaseId: purchase.id },
      select: { giroHistoryVerifiedAt: true, payments: { orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }, { id: "asc" }], select: { id: true, amount: true, paidAt: true } } },
    }),
    tx.shoppingRequestCorrection.findFirst({
      where: { storeId: input.storeId, shoppingRequestId: purchase.shoppingRequestId, ...(input.excludeCorrectionId ? { id: { not: input.excludeCorrectionId } } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { afterSnapshot: true, allocations: { select: { paymentId: true, sourceKind: true, method: true, amount: true, sourceAmount: true, paidAt: true } } },
    }),
  ]);
  if (expenses.length > 1 || expenses.some((expense) => expense.deletedAt || (expense.goodsPurchaseId && expense.goodsPurchaseId !== purchase.id))) {
    throw new Error("Sumber pengeluaran tidak dapat dipastikan. Periksa riwayat pembayaran secara manual.");
  }
  if ((payable && !payable.giroHistoryVerifiedAt) || (purchase.paymentMethod === "GIRO" && expenses.length > 0 && !payable)) {
    throw new Error("Riwayat Giro belum diverifikasi. Periksa pembayaran secara manual.");
  }
  const previous = latestCorrection ? readCorrectionPaymentSnapshot(latestCorrection.afterSnapshot) : null;
  if (previous && latestCorrection) {
    const sourceByKey = new Map(previous.sources.map((source) => [JSON.stringify([source.sourceKind, source.paymentId]), source]));
    const allocationByKey = new Map(previous.allocations.map((allocation) => [JSON.stringify([allocation.sourceKind, allocation.paymentId, allocation.method]), allocation]));
    if (latestCorrection.allocations.length !== previous.allocations.length || latestCorrection.allocations.some((row) => {
      const source = sourceByKey.get(JSON.stringify([row.sourceKind, row.paymentId]));
      const allocation = allocationByKey.get(JSON.stringify([row.sourceKind, row.paymentId, row.method]));
      return !source || !allocation || row.amount.toFixed(2) !== allocation.amount ||
        row.sourceAmount.toFixed(2) !== source.amount || row.paidAt.toISOString().slice(0, 10) !== source.paidAt;
    })) {
      throw new Error("Alokasi pembayaran dalam riwayat tidak lengkap. Periksa pembayaran secara manual.");
    }
  }
  const current: CorrectionPaymentSource[] = [];
  const expense = expenses[0];
  let transferAmount = purchase.initialTransferAmount;
  let transferPaidAt = purchase.initialTransferPaidAt;
  if (expense && transferAmount == null) {
    const historical = previous?.sources.find(source => source.sourceKind === "TRANSFER_EXPENSE" && source.paymentId === expense.id);
    const transferRows = purchase.payments.filter(row => row.method === "TRANSFER");
    const amount = historical?.amount ?? (transferRows.length ? transferRows.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2)
      : purchase.paymentMethod === "TRANSFER" && (!previous || purchase.totalBasis === "ORDERED") ? expense.amount.toFixed(2) : "0.00");
    const paidAt = historical?.paidAt ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(expense.occurredAt);
    await tx.$executeRaw`UPDATE "pos_goods_purchases" SET "initialTransferAmount" = ${amount}::numeric, "initialTransferPaidAt" = ${paidAt}::date WHERE "id" = ${purchase.id} AND "storeId" = ${input.storeId} AND "initialTransferAmount" IS NULL`;
    transferAmount = new Prisma.Decimal(amount);
    transferPaidAt = new Date(`${paidAt}T00:00:00.000Z`);
  }
  if (expense && transferAmount && (transferAmount.greaterThan(0) || previous?.sources.some(source => source.sourceKind === "TRANSFER_EXPENSE" && source.paymentId === expense.id))) {
    current.push({
      paymentId: expense.id,
      sourceKind: "TRANSFER_EXPENSE",
      amount: transferAmount.toFixed(2),
      paidAt: transferPaidAt!.toISOString().slice(0, 10),
    });
  }
  for (const payment of payable?.payments ?? []) {
    current.push({ paymentId: payment.id, sourceKind: "PAYABLE_PAYMENT", amount: payment.amount.toFixed(2), paidAt: payment.paidAt.toISOString().slice(0, 10) });
  }

  const sources = resolveCorrectionPaymentSources({ previous: previous?.sources ?? null, current, trustedTransferIds: expense && transferAmount?.greaterThan(0) ? [expense.id] : [] });
  const previousKeys = new Set((previous?.sources ?? []).map((source) => JSON.stringify([source.sourceKind, source.paymentId])));
  const allocations: CorrectionPaymentAllocation[] = [...(previous?.allocations ?? [])];
  for (const source of sources) {
    if (!previousKeys.has(JSON.stringify([source.sourceKind, source.paymentId]))) {
      allocations.push({ paymentId: source.paymentId, sourceKind: source.sourceKind, amount: source.amount, method: source.sourceKind === "TRANSFER_EXPENSE" ? "TRANSFER" : "GIRO" });
    }
  }
  return planCorrectionPayments(sources, allocations, []);
}
