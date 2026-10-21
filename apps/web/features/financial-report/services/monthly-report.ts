import { db } from '@pos/db';
import { buildMonthlyPeriod, buildMonthlyReport } from '../helpers/monthly-report-core';

export async function getMonthlyFinancialReport(storeId: string, year: number, month: number, now = new Date()) {
  if (!storeId) throw new Error('Toko pengguna belum tersedia.');
  const period = buildMonthlyPeriod(year, month, now);
  const bounds = { gte: period.start, lt: period.end };
  const paymentSelect = { id: true, method: true, amount: true, createdAt: true } as const;
  const [transactions, expenses, manualReceivables] = await Promise.all([
    db.transaction.findMany({
      where: { storeId, status: { in: ['COMPLETED', 'DP'] }, OR: [
        { invoiceDate: { lt: period.end } },
        { payments: { some: { createdAt: bounds } } },
        { debtPaymentLogs: { some: { storeId, createdAt: bounds } } },
        { createdAt: bounds },
      ] },
      select: {
        id: true, invoiceNumber: true, invoiceDate: true, createdAt: true, status: true, paymentMethod: true,
        total: true, amountPaid: true, change: true, transactionCategory: true, printingSubcategory: true,
        customerName: true, customer: { select: { name: true } },
        items: { select: { productName: true, subtotal: true, product: { select: { category: { select: { name: true } } } } } },
        payments: { select: paymentSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        debtPaymentLogs: { select: { id: true, paymentMethod: true, amount: true, createdAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    }),
    db.expense.findMany({
      where: { storeId, deletedAt: null, occurredAt: bounds },
      select: { id: true, occurredAt: true, category: true, amount: true, changeAmount: true, description: true, hasMissingCostSnapshot: true,
        shoppingRequest: { select: { status: true } },
        goodsPurchase: { select: { number: true, status: true, paymentMethod: true, paymentDueDate: true, supplierNameSnapshot: true } } },
    }),
    db.customerReceivable.findMany({
      where: { storeId, OR: [{ debtDate: { lte: new Date(`${period.to}T00:00:00Z`) } }, { payments: { some: { createdAt: bounds } } }] },
      select: { id: true, debtDate: true, dueDate: true, amount: true, note: true, customer: { select: { name: true } }, payments: { select: paymentSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    }),
  ]);
  return buildMonthlyReport({ year, month, period, transactions, expenses, manualReceivables });
}
