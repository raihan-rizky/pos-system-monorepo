"use client";

import { ArrowDownLeft, ArrowRight, ArrowUpRight, CalendarDays, CircleAlert, Wallet } from "lucide-react";
import Link from "next/link";
import { useRole } from "@/components/providers/RoleProvider";
import { FinanceCalculationDetails } from "@/features/keuangan/components/FinanceCalculationDetails";
import { calculateNetCashFlow } from "@/features/keuangan/helpers/keuangan-core";
import { useCashFlowSummary } from "@/features/keuangan/hooks/useKeuangan";
import { formatRupiahPrecise } from "@/lib/utils";
import { DashboardCashFlowInsights } from "./DashboardCashFlowInsights";
import { DashboardSupplierDebtInsight } from "./DashboardSupplierDebtInsight";
import { SectionCard } from "./SectionCard";
import styles from "./DashboardCashFlow.module.css";

const monthKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit",
});
const monthLabel = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta", year: "numeric", month: "long",
});

export function DashboardCashFlow() {
  const { canPerform, canAccess } = useRole();
  const canRead = canPerform("income", "read") && canPerform("expense", "read");
  const now = new Date();
  const month = monthKey.format(now).slice(0, 7);
  const { data, isLoading, isError } = useCashFlowSummary(month, canRead);

  if (!canRead) return null;

  const summary = isError ? undefined : data;
  const income = summary?.income.total ?? null;
  const expense = summary?.expense.total ?? null;
  const net = calculateNetCashFlow(income, expense);
  const isNegative = net !== null && net < 0;
  const scale = income !== null && expense !== null && income >= 0 && expense >= 0
    ? Math.max(income, expense)
    : 0;

  return (
    <SectionCard
      title="Arus Kas Bulan Ini"
      bodyClassName="p-4 sm:p-5"
      action={
        <time dateTime={month} className="flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-surface-600">
          <CalendarDays className="hidden h-3.5 w-3.5 text-brand-700 sm:block" aria-hidden="true" />
          {monthLabel.format(now)} · WIB
        </time>
      }
    >
      {summary ? (
        <div className={styles.content}>
          <div className={styles.overview}>
            <div className={`${styles.balance} relative min-w-0 overflow-hidden rounded-xl bg-brand-950 px-4 py-5 text-white sm:px-6`}>
              <dl className="relative min-w-0">
                <dt className="flex items-center gap-2 text-sm font-medium text-brand-100">
                  <Wallet className="h-4 w-4" aria-hidden="true" />
                  Arus Kas Bersih
                </dt>
                <dd className={`mt-3 [overflow-wrap:anywhere] ${net === null ? "text-xl font-semibold text-brand-100" : `${styles.balanceValue} ${isNegative ? "text-amber-200" : "text-white"}`}`}>
                  {net === null ? "Belum tersedia" : formatRupiahPrecise(net)}
                </dd>
              </dl>
              {isNegative && <p className="relative mt-2 text-xs font-medium text-amber-200">Pengeluaran melebihi pemasukan</p>}
            </div>

            <div className={styles.flows}>
              <div className="min-w-0 rounded-xl border border-surface-200 bg-surface-50/75 p-3 sm:px-4">
                <dl className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <dt className="flex items-center gap-2 text-sm font-medium text-surface-700">
                    <ArrowDownLeft className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                    Pemasukan
                  </dt>
                  <dd className="min-w-0 text-base font-semibold tabular-nums text-emerald-800 [overflow-wrap:anywhere]">
                    {formatRupiahPrecise(summary.income.total)}
                  </dd>
                </dl>
                {scale > 0 && income !== null && (
                  <div aria-hidden="true" className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-200">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${income / scale * 100}%` }} />
                  </div>
                )}
              </div>
              <div className="min-w-0 rounded-xl border border-surface-200 bg-surface-50/75 p-3 sm:px-4">
                <dl className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
                  <dt className="flex items-center gap-2 text-sm font-medium text-surface-700">
                    <ArrowUpRight className="h-4 w-4 text-red-700" aria-hidden="true" />
                    Pengeluaran
                  </dt>
                  <dd className="min-w-0 text-base font-semibold tabular-nums text-red-800 [overflow-wrap:anywhere]">
                    {expense === null ? "Belum tersedia" : formatRupiahPrecise(expense)}
                  </dd>
                </dl>
                {scale > 0 && expense !== null && (
                  <div aria-hidden="true" className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-200">
                    <div className="h-full rounded-full bg-red-500" style={{ width: `${expense / scale * 100}%` }} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {summary.expense.incomplete && (
            <p role="status" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Riwayat pengeluaran belum lengkap. Rincian menunjukkan nominal yang sudah diketahui.</span>
            </p>
          )}

          <DashboardCashFlowInsights summary={summary} />
          <FinanceCalculationDetails income={summary.income} expense={summary.expense} variant="dashboard" />
        </div>
      ) : (
        <p role="status" className="text-sm text-surface-600">
          {isLoading ? "Memuat ringkasan arus kas…" : "Ringkasan arus kas belum tersedia."}
        </p>
      )}
      <DashboardSupplierDebtInsight />
      {canAccess("/keuangan") && (
        <Link
          href={`/keuangan?month=${month}#riwayat-pengeluaran`}
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 hover:text-brand-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
        >
          Lihat riwayat pengeluaran
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
        </Link>
      )}
    </SectionCard>
  );
}
