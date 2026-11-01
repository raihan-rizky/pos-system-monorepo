import { db, Prisma } from '@pos/db';
import { recognizedExpenseFilter } from '@/features/keuangan/helpers/recognized-expense-filter';
import { buildMonthlyPeriod, buildMonthlyReport } from '../helpers/monthly-report-core';
import { getMonthlyBalances } from './monthly-balances';

export async function getMonthlyFinancialReport(storeId: string, year: number, month: number, now = new Date()) {
  if (!storeId) throw new Error('Toko pengguna belum tersedia.');
  const period = buildMonthlyPeriod(year, month, now);
  const bounds = { gte: period.start, lt: period.end };
  const calendarBounds = { gte: new Date(`${period.from}T00:00:00.000Z`), lt: new Date(Date.UTC(year, month, 1)) };
  const periodLastDate = new Date(`${period.to}T00:00:00.000Z`);
  const knownByNow = { lte: now };
  const paymentSelect = { id: true, method: true, amount: true, createdAt: true } as const;
  const purchaseSelect = { id: true, storeId: true, number: true, status: true, totalAmount: true, paymentMethod: true, paymentDueDate: true, supplierNameSnapshot: true,
    supplierPayable: { select: { id: true, storeId: true, debtDate: true, giroHistoryVerifiedAt: true, payments: { select: { id: true, amount: true, paidAt: true }, orderBy: [{ paidAt: 'asc' }, { id: 'asc' }] } } },
  } satisfies Prisma.GoodsPurchaseSelect;
  // All inputs must see the same committed state, including giro payments and
  // their remaining debt. A payment can otherwise commit between the queries.
  const [transactions, expenses, manualReceivables, balances, backdatedPurchases] = await db.$transaction(async tx => Promise.all([
    tx.transaction.findMany({
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
    tx.expense.findMany({
      where: { storeId, deletedAt: null, backdatedPurchaseDueId: null, backdatedPurchasePaymentId: null, AND: [recognizedExpenseFilter(now)], OR: [
        { occurredAt: bounds },
        { occurredAt: { lt: period.end }, OR: [{ goodsPurchaseId: { not: null } }, { shoppingRequestId: { not: null } }] },
        { occurredAt: knownByNow, goodsPurchase: { is: { paymentMethod: 'GIRO', paymentDueDate: calendarBounds } } },
        { occurredAt: knownByNow, shoppingRequest: { is: { goodsPurchases: { some: { storeId, status: 'APPROVED', paymentMethod: 'GIRO', paymentDueDate: calendarBounds } } } } },
        { occurredAt: knownByNow, goodsPurchase: { is: { supplierPayable: { is: { storeId, debtDate: { lte: periodLastDate } } } } } },
        { occurredAt: knownByNow, shoppingRequest: { is: { goodsPurchases: { some: { storeId, status: 'APPROVED', supplierPayable: { is: { storeId, debtDate: { lte: periodLastDate } } } } } } } },
      ] },
      select: { id: true, occurredAt: true, category: true, customCategory: { select: { name: true } }, amount: true, changeAmount: true, description: true, hasMissingCostSnapshot: true, goodsPurchaseId: true, shoppingRequestId: true, backdatedPurchaseDueId: true, backdatedPurchasePaymentId: true,
        shoppingRequest: { select: { status: true, number: true, goodsPurchases: { where: { storeId, status: 'APPROVED' }, select: purchaseSelect } } },
        goodsPurchase: { select: purchaseSelect } },
    }),
    tx.customerReceivable.findMany({
      where: { storeId, OR: [{ debtDate: { lte: new Date(`${period.to}T00:00:00Z`) } }, { payments: { some: { createdAt: bounds } } }] },
      select: { id: true, debtDate: true, dueDate: true, amount: true, note: true, customer: { select: { name: true } }, payments: { select: paymentSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    }),
    getMonthlyBalances(storeId, period, now, tx),
    tx.backdatedPurchase.findMany({
      where: { storeId, purchaseDate: { lte: periodLastDate } },
      select: { id: true, purchaseDate: true, dueDate: true, reference: true, paymentMethod: true, amount: true,
        payments: { select: { id: true, amount: true, paidAt: true }, orderBy: [{ paidAt: 'asc' }, { id: 'asc' }] } },
    }),
  ]), { isolationLevel: 'RepeatableRead', timeout: 30_000 });
  const scopedExpenses = expenses.map(expense => {
    const candidates = expense.shoppingRequest?.goodsPurchases?.filter(purchase => purchase.storeId === storeId && purchase.status === 'APPROVED') ?? [];
    const candidate = candidates.length === 1 ? candidates[0] : null;
    const matchesAmount = candidate && Math.round(Number(candidate.totalAmount) * 100) === Math.max(0, Math.round(Number(expense.amount) * 100) - Math.round(Number(expense.changeAmount) * 100));
    const purchase = expense.goodsPurchaseId ? expense.goodsPurchase : matchesAmount ? candidate : null;
    return {
      ...expense,
      purchaseAmountMismatch: Boolean(purchase && Math.round(Number(purchase.totalAmount) * 100) !== Math.max(0, Math.round(Number(expense.amount) * 100) - Math.round(Number(expense.changeAmount) * 100))),
      ambiguousPurchaseDueDates: !expense.goodsPurchaseId && !purchase ? candidates.filter(row => row.paymentMethod === 'GIRO' && row.paymentDueDate).map(row => row.paymentDueDate!) : [],
      goodsPurchase: purchase?.storeId === storeId ? {
        ...purchase,
        supplierPayable: purchase.supplierPayable?.storeId === storeId ? purchase.supplierPayable : null,
      } : null,
    };
  });
  const report = buildMonthlyReport({ year, month, period, transactions, expenses: scopedExpenses, manualReceivables, backdatedPurchases });
  const backdatedDebts = report.supplierDebts ?? [];
  Object.assign(report, balances);
  report.supplierDebts = [...balances.supplierDebts, ...backdatedDebts].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  report.supplierDebtBalance = (Math.round(balances.supplierDebtBalance * 100) + backdatedDebts.reduce((sum, debt) => sum + Math.round(debt.amount * 100), 0)) / 100;
  if (report.supplierDebtIncomplete) report.supplierDebtBalance = null;
  report.warnings = report.warnings.filter(warning => !warning.startsWith('Persediaan akhir dan hutang pemasok:'));
  if (balances.openingInventoryBalance === null) report.warnings.push('Nilai inventaris akhir bulan sebelumnya belum tersedia.');
  if (balances.inventoryBalance === null) report.warnings.push('Nilai inventaris akhir periode belum tersedia.');
  if (balances.openingInventoryBalance === null || balances.inventoryBalance === null) {
    report.warnings.push('Riwayat inventaris atau satuan dasar grup stok mungkin belum lengkap. Periksa satuan dasar di Produk.');
  }
  report.warnings.push('Saldo hutang mencakup hutang pemasok, belanja terdahulu, dan sisa giro yang riwayatnya telah diperiksa. Pembayaran hutang manual tidak otomatis menjadi pengeluaran.');
  return report;
}
