import { db, Prisma } from '@pos/db';
import { recognizedExpenseFilter } from '@/features/keuangan/helpers/recognized-expense-filter';
import { loadExpenseCorrectionCash } from '@/features/keuangan/repositories/expense-correction-cash-repository';
import { buildMonthlyPeriod, buildMonthlyReport } from '../helpers/monthly-report-core';
import { getMonthlyBalances } from './monthly-balances';
import { applyShoppingCorrectionReportPayments } from '../helpers/shopping-correction-report-payments';
import { buildManualPayableReport } from '../helpers/manual-payable-report';
import { applyKeuanganActivity } from '../helpers/monthly-keuangan-activity';
import { loadIncomePeriod } from './daily-income';
import { loadRecognizedExpenses } from '@/features/keuangan/services/recognized-finance';

export async function getMonthlyFinancialReport(
  storeId: string, year: number, month: number, now = new Date(), { basis }: { basis?: 'keuangan' } = {},
) {
  if (!storeId) throw new Error('Toko pengguna belum tersedia.');
  const period = buildMonthlyPeriod(year, month, now);
  const bounds = { gte: period.start, lt: period.end };
  const calendarBounds = { gte: new Date(`${period.from}T00:00:00.000Z`), lt: new Date(Date.UTC(year, month, 1)) };
  const periodLastDate = new Date(`${period.to}T00:00:00.000Z`);
  const knownByNow = { lte: now };
  const todayWib = new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const paymentSelect = { id: true, method: true, amount: true, createdAt: true } as const;
  const recognizedPurchase = { OR: [{ status: 'APPROVED' }, { status: 'CANCELLED', statusBeforeCancellation: 'APPROVED' }] } satisfies Prisma.GoodsPurchaseWhereInput;
  const purchaseSelect = { id: true, storeId: true, number: true, status: true, statusBeforeCancellation: true, totalAmount: true, paymentMethod: true, paymentDueDate: true, supplierNameSnapshot: true, initialTransferAmount: true, initialTransferPaidAt: true,
    payments: { select: { id: true, method: true, amount: true, dueDate: true }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] },
    supplierPayable: { select: { id: true, storeId: true, amount: true, debtDate: true, dueDate: true, note: true, giroHistoryVerifiedAt: true,
      payments: { select: { id: true, amount: true, paidAt: true }, orderBy: [{ paidAt: 'asc' }, { id: 'asc' }] },
      creditApplications: { where: { storeId, appliedAt: { lt: period.end } }, select: { amount: true } } } },
    shoppingRequest: { select: { corrections: { where: { storeId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { afterSnapshot: true, allocations: { select: { sourceKind: true, paymentId: true, method: true, amount: true, sourceAmount: true, paidAt: true } } } } } },
  } satisfies Prisma.GoodsPurchaseSelect;
  // All inputs must see the same committed state, including giro payments and
  // their remaining debt. A payment can otherwise commit between the queries.
  const [transactions, expenses, manualReceivables, balances, backdatedPurchases, manualIncome, correctionCash, manualPayables, incomePeriod, recognizedExpenses] = await db.$transaction(async tx => Promise.all([
    tx.transaction.findMany({
      where: { storeId, status: { in: ['COMPLETED', 'DP'] }, OR: [
        { invoiceDate: { lt: period.end } },
        { payments: { some: { createdAt: bounds } } },
        { debtPaymentLogs: { some: { storeId, createdAt: bounds } } },
        { createdAt: bounds },
      ] },
      select: {
        id: true, invoiceNumber: true, invoiceDate: true, createdAt: true, offlineSyncMetadata: true, status: true, paymentMethod: true,
        total: true, amountPaid: true, change: true, transactionCategory: true, printingSubcategory: true,
        customerName: true, customer: { select: { name: true } },
        printingReceipt: { select: { subcategory: true } },
        items: { select: { productName: true, subtotal: true, printingServiceId: true, product: { select: { category: { select: { name: true } }, catalogSubcategory: { select: { group: true, name: true } } } } } },
        payments: { select: paymentSelect, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
        debtPaymentLogs: { select: { id: true, paymentMethod: true, amount: true, createdAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
      },
    }),
    tx.expense.findMany({
      where: { storeId, deletedAt: null, backdatedPurchaseDueId: null, backdatedPurchasePaymentId: null, AND: [recognizedExpenseFilter(now)], OR: [
        { occurredAt: bounds },
        { occurredAt: { lt: period.end }, OR: [{ goodsPurchaseId: { not: null } }, { shoppingRequestId: { not: null } }] },
        { occurredAt: knownByNow, goodsPurchase: { is: { paymentMethod: 'GIRO', paymentDueDate: calendarBounds } } },
        { occurredAt: knownByNow, shoppingRequest: { is: { goodsPurchases: { some: { storeId, ...recognizedPurchase, paymentMethod: 'GIRO', paymentDueDate: calendarBounds } } } } },
        { occurredAt: knownByNow, goodsPurchase: { is: { storeId, payments: { some: { method: 'GIRO', dueDate: calendarBounds } } } } },
        { occurredAt: knownByNow, shoppingRequest: { is: { goodsPurchases: { some: { storeId, ...recognizedPurchase, payments: { some: { method: 'GIRO', dueDate: calendarBounds } } } } } } },
        { occurredAt: knownByNow, goodsPurchase: { is: { supplierPayable: { is: { storeId, debtDate: { lte: periodLastDate } } } } } },
        { occurredAt: knownByNow, shoppingRequest: { is: { goodsPurchases: { some: { storeId, ...recognizedPurchase, supplierPayable: { is: { storeId, debtDate: { lte: periodLastDate } } } } } } } },
        { occurredAt: knownByNow, goodsPurchase: { is: { shoppingRequest: { is: { corrections: { some: { storeId } } } } } } },
        { occurredAt: knownByNow, shoppingRequest: { is: { corrections: { some: { storeId } } } } },
      ] },
      select: { id: true, storeId: true, occurredAt: true, category: true, reportCategory: true, customCategory: { select: { name: true } }, amount: true, changeAmount: true, description: true, hasMissingCostSnapshot: true, applicantName: true, manualPurchasePaymentMethod: true, goodsPurchaseId: true, shoppingRequestId: true, backdatedPurchaseDueId: true, backdatedPurchasePaymentId: true,
        manualTransferAllocations: { select: { paymentId: true, payableId: true, amount: true } },
        shoppingRequest: { select: { status: true, number: true, deletion: { select: { previousStatus: true } }, goodsPurchases: { where: { storeId, ...recognizedPurchase }, select: purchaseSelect } } },
        goodsPurchase: { select: purchaseSelect } },
    }),
    tx.customerReceivable.findMany({
      where: { storeId, OR: [{ debtDate: { lte: new Date(`${period.to}T00:00:00Z`) } }, { payments: { some: { createdAt: bounds } } }, { payments: { some: { paidAt: calendarBounds } } }] },
      select: { id: true, debtDate: true, dueDate: true, amount: true, note: true, reportCategory: true, customer: { select: { name: true } }, payments: { select: { ...paymentSelect, paidAt: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    }),
    getMonthlyBalances(storeId, period, now, tx),
    tx.backdatedPurchase.findMany({
      where: { storeId, cancelledAt: null, purchaseDate: { lte: periodLastDate } },
      select: { id: true, purchaseDate: true, dueDate: true, reference: true, paymentMethod: true, amount: true,
        payments: { where: { cancelledAt: null }, select: { id: true, amount: true, paidAt: true }, orderBy: [{ paidAt: 'asc' }, { id: 'asc' }] } },
    }),
    tx.manualIncome.findMany({
      where: { storeId, deletedAt: null, occurredAt: bounds },
      select: { id: true, occurredAt: true, description: true, amount: true, category: true },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    }),
    loadExpenseCorrectionCash(tx, storeId, period.from.slice(0, 7), now),
    tx.supplierPayable.findMany({
      where: { storeId, goodsPurchaseId: null, debtDate: { lte: periodLastDate } },
      select: { id: true, storeId: true, supplierName: true, amount: true, debtDate: true, dueDate: true, reportCategory: true, note: true,
        payments: { where: { paidAt: { lte: new Date(`${todayWib}T00:00:00Z`) } }, select: { id: true, amount: true, paidAt: true, origin: true } } },
    }),
    basis === 'keuangan' ? loadIncomePeriod(storeId, period.from, period.to, { client: tx, now }) : undefined,
    basis === 'keuangan' ? loadRecognizedExpenses(storeId, period.from.slice(0, 7), now, true, tx) : undefined,
  ]), { isolationLevel: 'RepeatableRead', timeout: 30_000 });
  const scopedExpenses = expenses.map(expense => {
    const candidates = expense.shoppingRequest?.goodsPurchases?.filter(purchase => purchase.storeId === storeId && (purchase.status === 'APPROVED' || (purchase.status === 'CANCELLED' && purchase.statusBeforeCancellation === 'APPROVED'))) ?? [];
    const candidate = candidates.length === 1 ? candidates[0] : null;
    const matchesAmount = candidate && Math.round(Number(candidate.totalAmount) * 100) === Math.max(0, Math.round(Number(expense.amount) * 100) - Math.round(Number(expense.changeAmount) * 100));
    const purchase = expense.goodsPurchaseId ? expense.goodsPurchase : matchesAmount ? candidate : null;
    return {
      ...expense,
      purchaseAmountMismatch: Boolean(purchase && Math.round(Number(purchase.totalAmount) * 100) !== Math.max(0, Math.round(Number(expense.amount) * 100) - Math.round(Number(expense.changeAmount) * 100))),
      ambiguousPurchaseDueDates: !expense.goodsPurchaseId && !purchase ? candidates.flatMap(row => row.payments?.length
        ? row.payments.filter(payment => payment.method === 'GIRO' && payment.dueDate).map(payment => payment.dueDate!)
        : row.paymentMethod === 'GIRO' && row.paymentDueDate ? [row.paymentDueDate] : []) : [],
      goodsPurchase: purchase?.storeId === storeId ? {
        ...purchase,
        supplierPayable: purchase.supplierPayable?.storeId === storeId ? purchase.supplierPayable : null,
      } : null,
    };
  });
  const calendarDate = (value: Date) => value.toISOString().slice(0, 10);
  const wibDate = (value: Date) => new Date(value.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const manualPayableReport = buildManualPayableReport({ storeId, todayWib, from: period.from, to: period.to,
    payables: manualPayables.map(payable => ({ id: payable.id, storeId: payable.storeId, supplierName: payable.supplierName,
      amountCents: Math.round(Number(payable.amount) * 100), debtDate: calendarDate(payable.debtDate), dueDate: payable.dueDate ? calendarDate(payable.dueDate) : null,
      category: payable.reportCategory, note: payable.note, payments: payable.payments.map(payment => ({ id: payment.id, amountCents: Math.round(Number(payment.amount) * 100), paidAt: calendarDate(payment.paidAt), origin: payment.origin })) })),
    transfers: scopedExpenses.filter(expense => expense.occurredAt >= period.start && expense.occurredAt < period.end && expense.manualPurchasePaymentMethod === 'TRANSFER' && !expense.goodsPurchaseId && !expense.shoppingRequestId && (expense.manualTransferAllocations?.length ?? 0) > 0)
      .map(expense => ({ id: expense.id, storeId: expense.storeId, date: wibDate(expense.occurredAt), amountCents: Math.round((Number(expense.amount) - Number(expense.changeAmount)) * 100),
        category: expense.reportCategory, allocations: expense.manualTransferAllocations.map(allocation => ({ ...allocation, amountCents: Math.round(Number(allocation.amount) * 100) })) })),
  });
  const report = buildMonthlyReport({ year, month, period, transactions, expenses: scopedExpenses, manualReceivables, backdatedPurchases, manualIncome, manualPayableReport });
  for (const { date, total } of correctionCash.refunds) {
    report.income.push({
      id: `supplier-refund:${date}`, date, reference: '',
      description: 'Pengembalian dana pemasok',
      amounts: { CETAK: 0, PLAT: 0, STEMPEL: 0, SPANDUK: 0, ATK: 0, PRINT: 0, UNMAPPED: total },
    });
  }
  for (const { date, total } of correctionCash.outflow) {
    report.expenses.push({
      id: `cancelled-purchase-payment:${date}`, date,
      description: 'Pembayaran pembelian yang dibatalkan', group: 'OTHER', amount: total,
    });
  }
  if (correctionCash.refunds.length) report.income.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (correctionCash.outflow.length) report.expenses.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const backdatedDebts = report.supplierDebts ?? [];
  Object.assign(report, balances);
  const manualIds = new Set(manualPayables.map(payable => payable.id));
  const manualDebts = manualPayableReport.balances.map(({ amountCents, ...debt }) => ({ ...debt, amount: amountCents / 100 }));
  report.supplierDebts = [...balances.supplierDebts.filter(debt => !manualIds.has(debt.id)), ...manualDebts, ...backdatedDebts].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  report.supplierDebtBalance = report.supplierDebts.reduce((sum, debt) => sum + Math.round(debt.amount * 100), 0) / 100;
  if (report.supplierDebtIncomplete) report.supplierDebtBalance = null;
  report.warnings = report.warnings.filter(warning => !warning.startsWith('Persediaan akhir dan hutang pemasok:'));
  if (balances.openingInventoryBalance === null) report.warnings.push('Nilai inventaris akhir bulan sebelumnya belum tersedia dari riwayat.');
  if (balances.inventoryBalance === null) report.warnings.push('Nilai inventaris akhir periode belum tersedia dari riwayat.');
  if ((balances.openingInventoryUnvaluedCount ?? 0) > 0) report.warnings.push(`Modal awal belum lengkap: HPP belum tersedia untuk ${balances.openingInventoryUnvaluedCount} produk.`);
  if ((balances.inventoryUnvaluedCount ?? 0) > 0) report.warnings.push(`Nilai inventaris akhir belum lengkap: HPP belum tersedia untuk ${balances.inventoryUnvaluedCount} produk.`);
  report.warnings.push('Saldo hutang mencakup hutang pemasok, belanja terdahulu, dan sisa giro yang riwayatnya telah diperiksa.');
  applyShoppingCorrectionReportPayments(report, scopedExpenses.flatMap(expense => {
    const purchase = expense.goodsPurchase;
    const correction = purchase?.shoppingRequest?.corrections?.[0];
    return purchase && correction ? [{ expenseId: expense.id, occurredAt: expense.occurredAt, purchase, correction }] : [];
  }));
  if (incomePeriod && recognizedExpenses) {
    applyKeuanganActivity(report, incomePeriod.contributions, recognizedExpenses, { transactions, manualIncome, manualReceivables });
  }
  return report;
}
