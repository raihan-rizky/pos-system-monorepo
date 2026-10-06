import type { Prisma } from "@pos/db";

/** Fetch receipts by their own event dates, keeping the full tender ledger
 * available for change allocation before filtering individual payments. */
export async function findInitialCollections(
  client: Pick<Prisma.TransactionClient, "transaction">,
  storeId: string,
  dateBounds: { gte: Date; lt: Date },
) {
  const rows = await client.transaction.findMany({
    where: {
      storeId, status: { in: ["COMPLETED", "DP"] },
      OR: [
        { payments: { some: { createdAt: dateBounds } } },
        { createdAt: dateBounds, paymentMethod: { not: "TEMPO" }, payments: { none: {} }, debtPaymentLogs: { none: {} } },
      ],
    },
    select: {
      id: true, createdAt: true, status: true, paymentMethod: true, total: true, amountPaid: true, change: true,
      salesName: true, salesperson: { select: { name: true } },
      payments: { select: { method: true, amount: true, createdAt: true } },
      debtPaymentLogs: { select: { id: true } },
    },
  });
  return rows.map((row) => ({ ...row,
    total: Number(row.total), amountPaid: Number(row.amountPaid), change: Number(row.change),
    payments: row.payments.map((payment) => ({ ...payment, amount: Number(payment.amount) })),
  }));
}
