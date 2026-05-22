"use client";

import React from "react";
import {
  RefreshCw,
  Wallet,
  CheckCircle2,
  TrendingUp,
  Percent,
  Hourglass,
  AlertTriangle,
  CalendarRange,
  PackageX,
} from "lucide-react";
import { formatRupiah } from "@/lib/utils";
import {
  buildFinancialReportRange,
  type FinancialReportPreset,
} from "@/features/financial-report/helpers/report-core";
import { useFinancialReport } from "@/features/financial-report/hooks/useFinancialReport";
import { ReportExportMenu } from "@/features/financial-report/components/ReportExportMenu";
import { KpiCard } from "@/features/financial-report/components/KpiCard";
import { PaymentBreakdownCard } from "@/features/financial-report/components/PaymentBreakdownCard";
import { RankedListCard } from "@/features/financial-report/components/RankedListCard";
import { ShiftReconciliationCard } from "@/features/financial-report/components/ShiftReconciliationCard";
import { LossStokBreakdownCard } from "@/features/financial-report/components/LossStokBreakdownCard";
import { TrendChart } from "@/features/financial-report/components/TrendChart";

const PRESETS: Array<{ value: FinancialReportPreset; label: string }> = [
  { value: "today", label: "Hari ini" },
  { value: "7d", label: "7 hari" },
  { value: "month", label: "Bulan ini" },
];

function percent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatRange(dateFrom: string, dateTo: string): string {
  if (!dateFrom || !dateTo) return "";
  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(new Date(`${iso}T00:00:00+07:00`));
  if (dateFrom === dateTo) return fmt(dateFrom);
  return `${fmt(dateFrom)} – ${fmt(dateTo)}`;
}

export default function FinancialReportPage() {
  const initialRange = React.useMemo(
    () => buildFinancialReportRange("month"),
    [],
  );
  const [preset, setPreset] = React.useState<FinancialReportPreset | "custom">(
    "month",
  );
  const [dateFrom, setDateFrom] = React.useState(initialRange.dateFrom);
  const [dateTo, setDateTo] = React.useState(initialRange.dateTo);
  const { data: report, isLoading, isFetching, error } = useFinancialReport({
    dateFrom,
    dateTo,
  });

  const selectPreset = React.useCallback((nextPreset: FinancialReportPreset) => {
    const range = buildFinancialReportRange(nextPreset);
    setPreset(nextPreset);
    setDateFrom(range.dateFrom);
    setDateTo(range.dateTo);
  }, []);

  const handleDateFromChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setPreset("custom");
      setDateFrom(event.target.value);
    },
    [],
  );

  const handleDateToChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setPreset("custom");
      setDateTo(event.target.value);
    },
    [],
  );

  const summary = report?.summary;
  const transactionCount = summary?.transactionCount ?? 0;
  const lossStokNet = summary?.lossStokNet ?? 0;
  const lossStokUnclassifiedCount = summary?.lossStokUnclassifiedCount ?? 0;
  const lossTone = lossStokNet > 0 ? "warning" : lossStokNet < 0 ? "success" : "neutral";
  const grossMargin = summary?.grossMargin ?? 0;
  const marginTone =
    grossMargin >= 0.3 ? "success" : grossMargin >= 0.15 ? "brand" : "warning";

  const collectionRate =
    summary && summary.revenue > 0
      ? Math.min(1, summary.collected / summary.revenue)
      : 0;

  const productRows = React.useMemo(
    () =>
      (report?.topProducts ?? []).map((row) => ({
        key: row.productId || row.productName,
        name: row.productName,
        primaryValue: row.revenue,
        secondaryValue: row.grossProfit,
        countLabel: `${row.quantity} pcs`,
      })),
    [report?.topProducts],
  );

  const salesRows = React.useMemo(
    () =>
      (report?.salespersons ?? []).map((row) => ({
        key: row.name,
        name: row.name,
        primaryValue: row.revenue,
        secondaryValue: row.grossProfit,
        countLabel: `${row.transactionCount} trx`,
      })),
    [report?.salespersons],
  );

  const categoryRows = React.useMemo(
    () =>
      (report?.categories ?? [])
        .slice()
        .sort((a, b) => b.revenue - a.revenue)
        .map((row) => ({
          key: row.categoryName,
          name: row.categoryName,
          primaryValue: row.revenue,
          secondaryValue: row.grossProfit,
          countLabel: `${row.transactionCount} trx`,
        })),
    [report?.categories],
  );

  return (
    <main className="flex-1 overflow-y-auto bg-surface-50/40">
      <header className="sticky top-0 z-20 border-b border-surface-100 bg-white/85 backdrop-blur-md">
        <div className="px-4 py-4 md:px-8 md:py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold text-surface-900 md:text-2xl">
                Laporan Keuangan
              </h1>
              <p className="mt-1 text-sm text-surface-500">
                Revenue, gross profit, pembayaran, piutang, dan selisih shift.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div
                role="tablist"
                aria-label="Periode cepat"
                className="inline-flex rounded-xl border border-surface-200 bg-surface-50 p-1"
              >
                {PRESETS.map((item) => {
                  const active = preset === item.value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => selectPreset(item.value)}
                      className={`min-h-9 rounded-lg px-3 text-xs font-bold transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 ${
                        active
                          ? "bg-white text-brand-700 shadow-sm"
                          : "text-surface-500 hover:text-surface-900"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
              <ReportExportMenu />
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-6 px-4 py-6 md:px-8">
        <section
          aria-label="Filter periode"
          className="rounded-2xl border border-surface-200 bg-white shadow-sm"
        >
          <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end md:gap-4 md:p-5">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-surface-500">
                Dari
              </span>
              <input
                type="date"
                value={dateFrom}
                onChange={handleDateFromChange}
                className="w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-surface-500">
                Sampai
              </span>
              <input
                type="date"
                value={dateTo}
                onChange={handleDateToChange}
                min={dateFrom || undefined}
                className="w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 text-sm text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
            </label>
            <div
              role="status"
              aria-live="polite"
              className="flex min-h-10 items-center gap-2 rounded-xl bg-surface-50 px-3 py-2 text-sm font-medium text-surface-600 md:bg-transparent md:px-0"
            >
              <CalendarRange
                className="h-4 w-4 text-surface-400"
                aria-hidden="true"
              />
              <span className="truncate">
                {report
                  ? formatRange(report.dateFrom, report.dateTo)
                  : isLoading
                    ? "Memuat data…"
                    : formatRange(dateFrom, dateTo)}
              </span>
              {isFetching && !isLoading && (
                <RefreshCw
                  className="h-3.5 w-3.5 animate-spin text-brand-500"
                  aria-label="Menyegarkan"
                />
              )}
            </div>
          </div>

          {!isLoading && summary && summary.missingCostLineCount > 0 && (
            <div
              role="note"
              className="flex items-start gap-2 border-t border-amber-100 bg-amber-50/70 px-4 py-2.5 text-[12px] text-amber-800 md:px-5"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <p>
                {summary.missingCostLineCount} item belum punya HPP. Gross
                profit untuk item tersebut dihitung sebagai 0.
              </p>
            </div>
          )}

          {!isLoading && lossStokUnclassifiedCount > 0 && (
            <div
              role="note"
              className="flex items-start gap-2 border-t border-amber-100 bg-amber-50/70 px-4 py-2.5 text-[12px] text-amber-800 md:px-5"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <p>
                {lossStokUnclassifiedCount} entri stok belum ditandai alasannya
                (waste, opname, dll). Nilai mereka tidak dihitung di Loss Stok.
              </p>
            </div>
          )}
        </section>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
          >
            {error instanceof Error ? error.message : "Gagal memuat laporan"}
          </div>
        )}

        <section
          aria-label="Ringkasan KPI"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6"
        >
          <KpiCard
            label="Omzet"
            value={formatRupiah(summary?.revenue ?? 0)}
            hint={`${transactionCount} transaksi`}
            tone="brand"
            loading={isLoading}
            icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
            infoText={{
              title: "Omzet (Net Sales)",
              description:
                "Total semua transaksi setelah dikurangi diskon.",
              formula: "subtotal item − diskon item",
            }}
          />
          <KpiCard
            label="Terkumpul"
            value={formatRupiah(summary?.collected ?? 0)}
            hint={`${(collectionRate * 100).toFixed(1)}% dari omzet`}
            tone="success"
            loading={isLoading}
            icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            infoText={{
              title: "Uang Terkumpul",
              description:
                "Bagian dari Omzet yang sudah dibayar (DP terhitung sebatas yang dibayar).",
              formula: "total dibayar dari transaksi terkonfirmasi",
            }}
          />
          <KpiCard
            label="Laba Kotor"
            value={formatRupiah(summary?.grossProfit ?? 0)}
            hint="Setelah HPP & Loss Stok"
            tone="success"
            loading={isLoading}
            icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
            infoText={{
              title: "Laba Kotor",
              description:
                "Sisa dari Omzet setelah dikurangi HPP barang terjual dan kerugian stok.",
              formula: "Omzet − COGS − Loss Stok",
            }}
          />
          <KpiCard
            label="Margin"
            value={percent(grossMargin)}
            hint="Laba Kotor / Omzet"
            tone={marginTone}
            loading={isLoading}
            icon={<Percent className="h-4 w-4" aria-hidden="true" />}
            infoText={{
              title: "Margin Kotor",
              description: "Persentase Laba Kotor terhadap Omzet.",
              formula: "Laba Kotor ÷ Omzet × 100%",
            }}
          />
          <KpiCard
            label="Outstanding DP"
            value={formatRupiah(summary?.outstandingDp ?? 0)}
            hint="Sisa belum dibayar"
            tone="warning"
            loading={isLoading}
            icon={<Hourglass className="h-4 w-4" aria-hidden="true" />}
            infoText={{
              title: "Sisa DP Belum Lunas",
              description: "Uang yang masih harus ditagih dari transaksi DP.",
              formula: "total − dibayar (untuk transaksi DP)",
            }}
          />
          <KpiCard
            label="Loss Stok"
            value={formatRupiah(lossStokNet)}
            hint={
              lossStokUnclassifiedCount > 0
                ? `${lossStokUnclassifiedCount} belum diklasifikasi`
                : lossStokNet < 0
                  ? "Kelebihan stok ditemukan"
                  : "Waste, pemakaian, opname"
            }
            tone={lossTone}
            loading={isLoading}
            icon={<PackageX className="h-4 w-4" aria-hidden="true" />}
            infoText={{
              title: "Loss Stok (Net)",
              description:
                "Nilai stok yang hilang di periode ini. Opname yang menemukan kelebihan stok akan mengurangi nilai ini.",
              formula: "(waste + usage + opname + penyesuaian) × HPP",
            }}
          />
        </section>

        <TrendChart trend={report?.trend} loading={isLoading} />

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <PaymentBreakdownCard
            rows={report?.paymentMethods ?? []}
            totalRevenue={summary?.revenue ?? 0}
            loading={isLoading}
          />
          <LossStokBreakdownCard
            rows={report?.lossStok ?? []}
            loading={isLoading}
          />
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <RankedListCard
            title="Sales Teratas"
            accent="success"
            rows={salesRows}
            loading={isLoading}
            emptyText="Belum ada sales pada periode ini."
          />
          <RankedListCard
            title="Produk Terlaris"
            accent="brand"
            rows={productRows}
            loading={isLoading}
            maxRows={10}
            emptyText="Belum ada produk terjual."
          />
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <RankedListCard
            title="Kategori"
            accent="warning"
            rows={categoryRows}
            loading={isLoading}
            emptyText="Belum ada kategori pada periode ini."
          />
        </section>

        <ShiftReconciliationCard
          shifts={report?.shifts ?? []}
          loading={isLoading}
        />
      </div>
    </main>
  );
}
