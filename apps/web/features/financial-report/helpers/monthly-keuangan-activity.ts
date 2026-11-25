import type { ReceiptContribution } from './income-period';
import type { ExpenseGroup, IncomeGroup, MonthlyExpense, MonthlyFinancialReport, MonthlyIncome, MonthlyPurchasePayment } from './monthly-report-types';
import type { RecognizedExpenses } from '@/features/keuangan/services/recognized-finance';
import { isManualExpenseReportCategory, isManualReceiptReportCategory } from '@/features/keuangan/helpers/manual-report-categories';
import { jakartaToday } from './daily-income';

type ReceiptDetails = {
  transactions: ReadonlyArray<{ id: string; invoiceNumber: string | null; items: ReadonlyArray<{ productName: string }> }>;
  manualIncome: ReadonlyArray<{ id: string; description: string }>;
  manualReceivables: ReadonlyArray<{ id: string; note: string | null }>;
};

function toMonthlyIncome(contributions: ReceiptContribution[], details: ReceiptDetails): MonthlyIncome[] {
  const transactions = new Map(details.transactions.map(row => [row.id, row]));
  const manualIncome = new Map(details.manualIncome.map(row => [row.id, row.description]));
  const receivables = new Map(details.manualReceivables.map(row => [row.id, row.note]));

  return contributions.map(row => {
    const transaction = row.transactionId ? transactions.get(row.transactionId) : undefined;
    const receivableId = row.manualReceivableId ?? row.receivableId;
    const income: MonthlyIncome = {
      id: row.id,
      date: row.date,
      reference: transaction?.invoiceNumber ?? row.transactionId ?? '',
      description: transaction?.items.map(item => item.productName).join(', ') || 'Penerimaan transaksi',
      amounts: { CETAK: 0, PLAT: 0, STEMPEL: 0, SPANDUK: 0, ATK: 0, PRINT: 0, UNMAPPED: 0 },
      breakdown: row.allocations,
    };
    if (row.source === 'manual' && row.manualIncomeId) {
      income.id = 'manual-income:' + row.id;
      income.reference = 'Pemasukan manual ' + row.manualIncomeId;
      income.description = manualIncome.get(row.manualIncomeId) || 'Pemasukan manual';
    } else if (row.source === 'manual-receivable') {
      income.id = 'manual:' + row.id;
      income.reference = 'Piutang manual';
      income.description = (receivableId && receivables.get(receivableId)) || 'Penerimaan piutang manual';
    } else if (row.source === 'supplier-refund') {
      income.description = 'Pengembalian dana pemasok';
    }

    let allocatedCents = 0;
    for (const part of row.allocations) {
      const subcategory = part.subcategory.trim().toUpperCase();
      const group: IncomeGroup = part.category === 'ATK' ? 'ATK'
        : part.category === 'Percetakan' && isManualReceiptReportCategory(subcategory) ? subcategory : 'UNMAPPED';
      const amountCents = Math.round(part.amount * 100);
      income.amounts[group] = (Math.round(income.amounts[group] * 100) + amountCents) / 100;
      allocatedCents += amountCents;
    }
    // If classification is missing, keep the entire receipt in the workbook total.
    income.amounts.UNMAPPED =
      (Math.round(income.amounts.UNMAPPED * 100) + Math.round(row.amount * 100) - allocatedCents) / 100;
    return income;
  });
}

export function applyKeuanganActivity(
  report: MonthlyFinancialReport,
  contributions: ReceiptContribution[],
  recognized: RecognizedExpenses,
  details: ReceiptDetails,
): void {
  const manualExpenses = new Map(report.expenses.map(row => [row.id, row]));
  const suppliers = new Map(report.purchaseExpenses?.flatMap(row =>
    row.purchase ? [[row.purchase.reference, row.purchase.supplier] as const] : []) ?? []);
  const expenses: MonthlyExpense[] = [];
  const purchasePayments: MonthlyPurchasePayment[] = [];

  for (const row of recognized.rows) {
    const date = jakartaToday(new Date(row.occurredAt));
    const manual = manualExpenses.get(row.id);
    const group: ExpenseGroup = row.reportCategory ?? manual?.group ?? 'OTHER';
    const description = row.description || row.applicantName || 'Pengeluaran';

    if ('number' in row.source || row.source.type === 'MANUAL_TRANSFER_PURCHASE') {
      const reference = 'number' in row.source ? row.source.number : 'Belanja manual ' + row.id;
      const kind = row.recognitionKind;
      const isGiro = kind === 'giro_payment' || kind === 'giro_due';
      const recognitionKind = kind === 'giro_payment' || kind === 'giro_due' || kind === 'overpayment' ? kind : 'transfer';
      const method = isGiro || row.paidMethod === 'GIRO' || row.paymentSource?.kind === 'SUPPLIER_PAYABLE_PAYMENT' ? 'GIRO' : 'TRANSFER';
      const segments = Object.entries(row.reportCategoryAmounts ?? {}).flatMap(([category, amount]) =>
        amount === undefined ? [] : [{ category, amount }]);
      const payment = {
        date, reference, supplier: suppliers.get(reference) || row.applicantName || '',
        method, recognitionKind, paidAt: row.paidAt,
      } as const;
      if (!segments.length) purchasePayments.push({ ...payment, id: row.id, group, amount: row.netAmount });
      for (const { category, amount } of segments) {
        const value = category.slice('report:'.length);
        purchasePayments.push({
          ...payment, id: row.id + ':' + category, group: isManualExpenseReportCategory(value) ? value : 'OTHER', amount,
        });
      }
    } else {
      expenses.push({ id: row.id, date, description, categoryName: manual?.categoryName, group, amount: row.netAmount });
    }
  }

  report.basis = 'keuangan';
  report.income = toMonthlyIncome(contributions, details);
  report.expenses = expenses;
  report.purchasePayments = purchasePayments.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  report.giroPayments = report.purchasePayments.filter(row => row.recognitionKind === 'giro_payment');
  report.cashIncomplete = recognized.incomplete;
  const cashBasis = 'Laporan menggunakan basis kas; hasil merupakan selisih penerimaan dan pengeluaran, bukan laba akrual lengkap.';
  report.warnings = report.warnings.filter(warning => warning !== cashBasis);
  report.warnings.unshift('Pemasukan dan pengeluaran mengikuti tanggal pencatatan di Keuangan.');
  if (report.income.some(row => row.amounts.UNMAPPED > 0) && !report.warnings.some(warning => warning.includes('perlu pemetaan'))) {
    report.warnings.push('Sebagian penerimaan perlu pemetaan kategori. Nilainya tetap masuk total.');
  }
}
