import type { Prisma } from "@pos/db";

/** Scheduled historical-purchase expenses become visible at midnight in Jakarta. */
export function recognizedExpenseFilter(now = new Date()): Prisma.ExpenseWhereInput {
  const jakarta = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const nextMidnight = new Date(Date.UTC(
    jakarta.getUTCFullYear(), jakarta.getUTCMonth(), jakarta.getUTCDate() + 1, -7,
  ));
  return { OR: [{ backdatedPurchaseDueId: null }, { occurredAt: { lt: nextMidnight } }] };
}
