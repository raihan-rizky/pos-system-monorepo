import type { Prisma } from "@pos/db";
import { buildExpenseCorrectionCash } from "../helpers/expense-correction-cash";
import { buildKeuanganMonthRange } from "../helpers/keuangan-core";

const dateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
});

export async function loadExpenseCorrectionCash(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  storeId: string,
  month: string,
  now: Date,
) {
  const { start, end } = buildKeuanganMonthRange(month);
  const calendarStart = new Date(start.getTime() + 7 * 60 * 60 * 1000);
  const calendarEnd = new Date(end.getTime() + 7 * 60 * 60 * 1000);
  const entries = await tx.$queryRaw<Array<{
    kind: "REFUND" | "CREDIT"; amount: Prisma.Decimal; paidAt: Date; receivedAt: Date | null;
  }>>`
    SELECT settlement."kind", settlement."amount", payment."paidAt", settlement."receivedAt"
    FROM "pos_expense_payment_settlements" settlement
    JOIN "pos_backdated_purchase_payments" payment
      ON settlement."paymentKind" = 'BACKDATED_PAYMENT' AND payment.id = settlement."paymentId"
    JOIN "pos_backdated_purchases" purchase
      ON purchase.id = payment."purchaseId" AND purchase."storeId" = settlement."storeId"
    WHERE settlement."storeId" = ${storeId}
      AND settlement."kind" IN ('REFUND', 'CREDIT')
      AND (payment."cancelledAt" IS NOT NULL OR purchase."cancelledAt" IS NOT NULL)
      AND ((payment."paidAt" >= ${calendarStart}::date AND payment."paidAt" < ${calendarEnd}::date)
        OR (settlement."receivedAt" >= ${calendarStart}::date AND settlement."receivedAt" < ${calendarEnd}::date))
  `;
  return buildExpenseCorrectionCash(entries.map(entry => ({
    kind: entry.kind,
    amountCents: entry.amount.mul(100).toNumber(),
    paidAt: entry.paidAt.toISOString().slice(0, 10),
    receivedAt: entry.receivedAt?.toISOString().slice(0, 10) ?? null,
  })), month, dateFormat.format(now));
}
