import { netInitialPayments } from '@/features/customer-debt/helpers/net-initial-payments';
import type { IncomeGroup, MonthlyFinancialReport } from './monthly-report-types';

export type MonthlyPeriod = { from: string; to: string; start: Date; end: Date };
type Money = unknown;
type Payment = { id: string; method: string; amount: Money; createdAt: Date };
export type MonthlyTransactionInput = {
  id: string; invoiceNumber: string | null; invoiceDate: Date; createdAt: Date;
  status: string; paymentMethod: string; total: Money; amountPaid: Money; change: Money;
  transactionCategory?: string | null; printingSubcategory?: string | null; customerName?: string | null;
  customer?: { name: string } | null;
  items: { productName: string; subtotal: Money; product?: { category?: { name: string } | null } | null }[];
  payments: Payment[];
  debtPaymentLogs: { id: string; paymentMethod: string; amount: Money; createdAt: Date }[];
};
export type MonthlyExpenseInput = {
  id: string; occurredAt: Date; category: string; amount: Money; changeAmount: Money;
  description: string | null; deletedAt?: Date | null;
  hasMissingCostSnapshot?: boolean;
  shoppingRequest?: { status: string } | null;
  goodsPurchase?: { number: string; status: string; paymentMethod: string | null; paymentDueDate: Date | null; supplierNameSnapshot: string } | null;
};
export type MonthlyManualReceivableInput = {
  id: string; debtDate: Date; dueDate: Date; amount: Money; note: string | null;
  customer: { name: string }; payments: Payment[];
};

const groups: IncomeGroup[] = ['CETAK', 'PLAT', 'STEMPEL', 'SPANDUK', 'ATK', 'PRINT', 'UNMAPPED'];
const cents = (value: Money) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) throw new Error('Nominal laporan tidak valid.');
  return Math.max(0, Math.round(numeric * 100));
};
const dateKey = (value: Date) => new Date(value.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
// Prisma @db.Date values are calendar dates, not payment event timestamps.
const calendarKey = (value: Date) => value.toISOString().slice(0, 10);

export function buildMonthlyPeriod(year: number, month: number, now = new Date()): MonthlyPeriod {
  if (!Number.isInteger(year) || year < 1900 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isFinite(now.getTime())) {
    throw new RangeError('Pilih tahun dan bulan yang valid.');
  }
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  const today = dateKey(now);
  if (prefix > today.slice(0, 7)) throw new RangeError('Bulan mendatang belum dapat diekspor.');
  const from = `${prefix}-01`;
  const start = new Date(`${from}T00:00:00+07:00`);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const fullEnd = new Date(`${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01T00:00:00+07:00`);
  const end = prefix === today.slice(0, 7) ? new Date(new Date(`${today}T00:00:00+07:00`).getTime() + 86400000) : fullEnd;
  return { from, to: dateKey(new Date(end.getTime() - 1)), start, end };
}

/** Largest-remainder allocation uses integer cents and stable group order. */
export function allocateMonthlyIncome(amount: number, weights: { group: IncomeGroup; amount: number }[]): Record<IncomeGroup, number> {
  const result = Object.fromEntries(groups.map(group => [group, 0])) as Record<IncomeGroup, number>;
  const combined = groups.map(group => ({ group, weight: weights.filter(row => row.group === group).reduce((sum, row) => sum + cents(row.amount), 0) }));
  const totalWeight = combined.reduce((sum, row) => sum + row.weight, 0);
  const total = cents(amount);
  if (totalWeight === 0) { result.UNMAPPED = total / 100; return result; }
  const allocations = combined.map((row, index) => {
    const exact = total * row.weight / totalWeight;
    return { ...row, index, value: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = total - allocations.reduce((sum, row) => sum + row.value, 0);
  for (const row of [...allocations].sort((a,b) => b.remainder - a.remainder || a.index - b.index)) {
    if (remaining-- > 0) row.value += 1;
  }
  for (const row of allocations) result[row.group] = row.value / 100;
  return result;
}

function explicitGroup(value?: string | null): IncomeGroup {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'PERCETAKAN' || normalized === 'CETAK') return 'CETAK';
  return groups.includes(normalized as IncomeGroup) ? normalized as IncomeGroup : 'UNMAPPED';
}

function transactionWeights(transaction: MonthlyTransactionInput) {
  const category = transaction.transactionCategory;
  if (category === 'ATK') return [{ group: 'ATK' as const, amount: 1 }];
  if (category === 'PERCETAKAN' && transaction.printingSubcategory) return [{ group: explicitGroup(transaction.printingSubcategory), amount: 1 }];
  return transaction.items.map(item => ({ group: explicitGroup(item.product?.category?.name), amount: cents(item.subtotal) / 100 }));
}

function uniquePayments<T extends { id: string }>(payments: T[]): T[] {
  return [...new Map(payments.map(payment => [payment.id, payment])).values()];
}

/** Allocate refunds using the complete ledger before applying historical cutoffs. */
function transactionEvents(transaction: MonthlyTransactionInput) {
  const initial = uniquePayments(transaction.payments);
  const debts = uniquePayments(transaction.debtPaymentLogs).map(payment => ({ ...payment, method: payment.paymentMethod }));
  const retained = Math.min(cents(transaction.total), Math.max(0, cents(transaction.amountPaid) - cents(transaction.change)));
  const debtTotal = debts.reduce((sum, payment) => sum + (payment.method === 'TEMPO' ? 0 : cents(payment.amount)), 0);
  const initialLimit = Math.max(0, retained - debtTotal) / 100;
  const debtLimit = Math.min(debtTotal, retained) / 100;
  const initialLedger = initial.length ? initial : transaction.paymentMethod === 'TEMPO' ? [] : [{ id: `legacy-${transaction.id}`, method: transaction.paymentMethod, amount: initialLimit, createdAt: transaction.createdAt }];
  return [
    ...netInitialPayments(initialLedger, { total: initialLimit, amountPaid: initialLimit }),
    ...netInitialPayments(debts, { total: debtLimit, amountPaid: debtLimit }),
  ];
}

export function buildMonthlyReport(input: {
  year: number; month: number; period: MonthlyPeriod; transactions: MonthlyTransactionInput[];
  expenses: MonthlyExpenseInput[]; manualReceivables: MonthlyManualReceivableInput[];
}): MonthlyFinancialReport {
  const { year, month, period } = input;
  const report: MonthlyFinancialReport = {
    year, month, from: period.from, to: period.to, income: [], expenses: [], receivables: [], inventoryBalance: null, supplierDebtBalance: null,
    warnings: ['Laporan menggunakan basis kas; hasil merupakan selisih penerimaan dan pengeluaran, bukan laba akrual lengkap.', 'Persediaan akhir dan hutang pemasok: Belum tersedia dari sistem.', 'Riwayat memakai ledger yang tersedia; pengembalian dana atau perubahan nominal tanpa riwayat tidak dapat direkonstruksi.'],
  };
  const inPeriod = (date: Date) => date >= period.start && date < period.end;
  for (const transaction of input.transactions) {
    if (!['COMPLETED', 'DP'].includes(transaction.status)) continue;
    const events = transactionEvents(transaction);
    const reference = transaction.invoiceNumber || transaction.id;
    const description = transaction.items.map(item => item.productName).join(', ') || 'Penerimaan transaksi';
    for (const event of events) {
      if (event.amount <= 0 || event.method === 'TEMPO' || !inPeriod(event.createdAt)) continue;
      report.income.push({ id: `${transaction.id}:${event.id}`, date: dateKey(event.createdAt), reference, description, amounts: allocateMonthlyIncome(event.amount, transactionWeights(transaction)) });
    }
    if (transaction.invoiceDate < period.end) {
      const paid = events.filter(event => event.createdAt < period.end).reduce((sum, event) => sum + cents(event.amount), 0);
      const outstanding = Math.max(0, cents(transaction.total) - paid) / 100;
      if (outstanding > 0) report.receivables.push({ id: transaction.id, date: dateKey(transaction.invoiceDate), dueDate: null, reference, description, customer: transaction.customerName || transaction.customer?.name || 'Tanpa nama pelanggan', amount: outstanding });
    }
  }
  for (const receivable of input.manualReceivables) {
    const payments = uniquePayments(receivable.payments);
    const events = netInitialPayments(payments, { total: receivable.amount, amountPaid: payments.reduce((sum, payment) => sum + (payment.method === 'TEMPO' ? 0 : cents(payment.amount)), 0) / 100 });
    const reference = `Piutang manual ${receivable.id}`;
    const description = receivable.note || 'Penerimaan piutang manual';
    for (const event of events) {
      if (event.amount <= 0 || !inPeriod(event.createdAt)) continue;
      report.income.push({ id: `manual:${receivable.id}:${event.id}`, date: dateKey(event.createdAt), reference, description, amounts: allocateMonthlyIncome(event.amount, []) });
    }
    if (calendarKey(receivable.debtDate) <= period.to) {
      const paid = events.filter(event => event.createdAt < period.end).reduce((sum, event) => sum + cents(event.amount), 0);
      const outstanding = Math.max(0, cents(receivable.amount) - paid) / 100;
      if (outstanding > 0) report.receivables.push({ id: `manual:${receivable.id}`, date: calendarKey(receivable.debtDate), dueDate: calendarKey(receivable.dueDate), reference, description, customer: receivable.customer.name, amount: outstanding });
    }
  }
  for (const expense of [...new Map(input.expenses.map(row => [row.id, row])).values()]) {
    if (expense.deletedAt || !inPeriod(expense.occurredAt) || (expense.goodsPurchase && expense.goodsPurchase.status !== 'APPROVED') || (expense.shoppingRequest && expense.shoppingRequest.status !== 'APPROVED')) continue;
    const purchase = expense.goodsPurchase;
    if (expense.hasMissingCostSnapshot && !report.warnings.some(warning => warning.includes('snapshot biaya'))) report.warnings.push('Sebagian pengeluaran belum memiliki snapshot biaya lengkap; total pengeluaran dapat belum lengkap.');
    report.expenses.push({ id: expense.id, date: dateKey(expense.occurredAt), description: expense.description || 'Pengeluaran', amount: Math.max(0, cents(expense.amount) - cents(expense.changeAmount)) / 100, group: expense.category === 'SALARY' ? 'SALARY' : 'OTHER', ...(purchase ? { purchase: { reference: purchase.number, method: purchase.paymentMethod, dueDate: purchase.paymentDueDate ? calendarKey(purchase.paymentDueDate) : null, supplier: purchase.supplierNameSnapshot } } : {}) });
  }
  if (report.income.some(row => row.amounts.UNMAPPED > 0)) report.warnings.push('Sebagian penerimaan perlu pemetaan kategori, termasuk piutang manual; nilainya tetap masuk total.');
  if (report.expenses.some(row => row.purchase)) report.warnings.push('Kategori belanja tanpa snapshot terverifikasi ditampilkan sebagai Lain-lain.');
  report.income.sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  report.expenses.sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  report.receivables.sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  return report;
}
