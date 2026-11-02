import { db } from '@pos/db';

export function getManualIncomeRows(storeId: string, start: Date, end: Date) {
  return db.manualIncome.findMany({
    where: { storeId, deletedAt: null, occurredAt: { gte: start, lt: end } },
    select: { id: true, occurredAt: true, amount: true },
    orderBy: { occurredAt: 'asc' },
  });
}
