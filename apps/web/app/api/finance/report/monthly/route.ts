import { NextResponse } from 'next/server';
import { handleAuthError } from '@/lib/rbac/guard';
import { getFinancialExportAccess } from '@/features/financial-report/services/export-access';
import { apiError } from '@/lib/api/responses';
import { getLogger } from '@/lib/logger';
import { buildMonthlyPeriod } from '@/features/financial-report/helpers/monthly-report-core';
import { getMonthlyFinancialReport } from '@/features/financial-report/services/monthly-report';
import type { IncomeGroup, MonthlyExpense, MonthlyFinancialReport, MonthlyIncome, MonthlyPurchasePayment, MonthlyGiroPayment } from '@/features/financial-report/helpers/monthly-report-types';

export const dynamic = 'force-dynamic';
const log = getLogger('api:finance:report:monthly');

function aggregateManualIncome(report: MonthlyFinancialReport): MonthlyFinancialReport {
  const groups = new Map<string, MonthlyIncome>();
  const income = report.income.filter(row => {
    if (!row.id.startsWith('manual-income:')) return true;
    const key = JSON.stringify([row.date, (row.breakdown ?? []).map(({ category, subcategory }) => [category, subcategory])]);
    const previous = groups.get(key);
    if (!previous) {
      groups.set(key, { ...row, id: `manual-income:aggregate:${groups.size}`, reference: 'Pemasukan manual', description: 'Pemasukan manual',
        amounts: { ...row.amounts }, breakdown: row.breakdown?.map(part => ({ ...part })) });
      return false;
    }
    for (const group of Object.keys(row.amounts) as IncomeGroup[]) {
      previous.amounts[group] = (Math.round((previous.amounts[group] ?? 0) * 100) + Math.round(row.amounts[group] * 100)) / 100;
    }
    previous.breakdown?.forEach((part, index) => {
      part.amount = (Math.round(part.amount * 100) + Math.round((row.breakdown?.[index]?.amount ?? 0) * 100)) / 100;
    });
    return false;
  });
  return { ...report, income: [...income, ...groups.values()] };
}

const sumMoney = (a: number, b: number) => (Math.round(a * 100) + Math.round(b * 100)) / 100;

function restrictMonthlyDetails(report: MonthlyFinancialReport, access: {
  canReadManualIncome: boolean; canReadTransactions: boolean; canReadExpenses: boolean;
  canReadCustomers: boolean; canReadPurchases: boolean;
}): MonthlyFinancialReport {
  if (access.canReadManualIncome && access.canReadTransactions && access.canReadExpenses && access.canReadCustomers && access.canReadPurchases) return report;
  const manualSafe = access.canReadManualIncome ? report : aggregateManualIncome(report);
  const incomeGroups = new Map<string, MonthlyIncome>();
  const income = manualSafe.income.filter(row => {
    const restricted = row.id.startsWith('manual-income:') ? false
      : row.id.startsWith('manual:') ? !access.canReadCustomers : !access.canReadTransactions;
    if (!restricted) return true;
    const key = row.date;
    let group = incomeGroups.get(key);
    if (!group) {
      group = { id: `restricted:income:${incomeGroups.size}`, date: row.date, reference: 'Rincian dibatasi', description: 'Penerimaan gabungan',
        amounts: { ...row.amounts }, breakdown: row.breakdown?.map(part => ({ ...part })) };
      incomeGroups.set(key, group);
    } else {
      for (const name of Object.keys(row.amounts) as IncomeGroup[]) group.amounts[name] = sumMoney(group.amounts[name] ?? 0, row.amounts[name]);
      for (const part of row.breakdown ?? []) {
        const previous = group.breakdown?.find(item => item.category === part.category && item.subcategory === part.subcategory);
        if (previous) previous.amount = sumMoney(previous.amount, part.amount);
        else (group.breakdown ??= []).push({ ...part });
      }
    }
    return false;
  });

  const groupExpenses = (rows: MonthlyExpense[], purchase: boolean): MonthlyExpense[] => {
    const groups = new Map<string, MonthlyExpense>();
    for (const row of rows) {
      const key = JSON.stringify([row.date, row.group, purchase ? row.purchase?.method : null]);
      const previous = groups.get(key);
      if (previous) previous.amount = sumMoney(previous.amount, row.amount);
      else groups.set(key, { id: `restricted:expense:${groups.size}`, date: row.date, description: 'Rincian dibatasi', amount: row.amount, group: row.group,
        ...(purchase ? { purchase: { reference: 'Rincian dibatasi', method: row.purchase?.method ?? null, dueDate: null, supplier: '' } } : {}) });
    }
    return [...groups.values()];
  };
  const groupPayments = <T extends MonthlyGiroPayment | MonthlyPurchasePayment>(rows: T[]): T[] => {
    const groups = new Map<string, T>();
    for (const row of rows) {
      const key = JSON.stringify([row.date, row.group, 'method' in row ? row.method : null]);
      const previous = groups.get(key);
      if (previous) previous.amount = sumMoney(previous.amount, row.amount);
      else groups.set(key, { id: `restricted:payment:${groups.size}`, date: row.date, amount: row.amount,
        reference: 'Rincian dibatasi', supplier: '', group: row.group, ...('method' in row ? { method: row.method } : {}) } as T);
    }
    return [...groups.values()];
  };
  const isRestrictedReceivable = (row: MonthlyFinancialReport['receivables'][number]) => row.id.startsWith('manual:')
    ? !access.canReadCustomers : !access.canReadCustomers || !access.canReadTransactions;
  const restrictedReceivables = report.receivables.filter(isRestrictedReceivable);
  const visibleReceivables = report.receivables.filter(row => !isRestrictedReceivable(row));
  const receivables = restrictedReceivables.length ? [...visibleReceivables, {
    id: 'restricted:receivables', date: report.to, dueDate: null, reference: '', description: 'Rincian dibatasi', customer: '',
    amount: restrictedReceivables.reduce((sum, row) => sumMoney(sum, row.amount), 0),
  }] : report.receivables;
  const debts = report.supplierDebts;
  const supplierDebts = !access.canReadPurchases && debts?.length ? [{
    id: 'restricted:supplier-debts', date: report.to, dueDate: null, supplier: 'Rincian dibatasi', note: null,
    amount: debts.reduce((sum, row) => sumMoney(sum, row.amount), 0),
  }] : debts;
  return {
    ...manualSafe, income: [...income, ...incomeGroups.values()], receivables, supplierDebts,
    expenses: !access.canReadExpenses ? [
      ...groupExpenses(report.expenses.filter(row => !row.purchase), false),
      ...groupExpenses(report.expenses.filter(row => row.purchase), true),
    ] : access.canReadPurchases ? report.expenses : [
      ...report.expenses.filter(row => !row.purchase), ...groupExpenses(report.expenses.filter(row => row.purchase), true),
    ],
    purchaseExpenses: access.canReadPurchases || !report.purchaseExpenses ? report.purchaseExpenses : groupExpenses(report.purchaseExpenses, true),
    purchasePayments: access.canReadPurchases || !report.purchasePayments ? report.purchasePayments : groupPayments(report.purchasePayments),
    giroPayments: access.canReadPurchases || !report.giroPayments ? report.giroPayments : groupPayments(report.giroPayments),
    warnings: access.canReadPurchases ? report.warnings : report.warnings?.map(warning => warning.startsWith('Jatuh tempo giro ') && warning.endsWith(' belum tersedia.')
      ? 'Sebagian jatuh tempo giro belum tersedia.' : warning),
  };
}

export async function GET(request: Request) {
  try {
    const access = await getFinancialExportAccess(request);
    if ("response" in access) return access.response;
    if (!access.canReadTransactions || !access.canReadCustomers || !access.canReadReceivables || !access.canReadPurchases || !access.canReadInventory) {
      return apiError('Ekspor bulanan memerlukan hak akses Produk, Riwayat, transaksi, pelanggan, pengeluaran, supplier, utang, dan giro. Minta pengelola hak akses melengkapinya.', 403, { code: 'Forbidden' });
    }
    const { user } = access;
    if (!user.storeId) return apiError('Toko pengguna belum tersedia.', 403, { code: 'Forbidden' });
    const params = new URL(request.url).searchParams;
    const yearText = params.get('year') || '';
    const monthText = params.get('month') || '';
    const year = Number(yearText);
    const month = Number(monthText);
    try {
      if (!/^\d{4}$/.test(yearText) || !/^\d{1,2}$/.test(monthText)) throw new RangeError();
      buildMonthlyPeriod(year, month);
    } catch {
      return apiError('Pilih tahun dan bulan yang valid. Bulan mendatang belum dapat diekspor.', 422, { code: 'ValidationError' });
    }
    const report = await getMonthlyFinancialReport(user.storeId, year, month);
    return NextResponse.json(restrictMonthlyDetails(report, access), { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error('Gagal menyiapkan laporan keuangan bulanan', error);
    return apiError('Laporan bulanan belum berhasil disiapkan. Silakan coba lagi.', 500, { code: 'InternalError' });
  }
}
