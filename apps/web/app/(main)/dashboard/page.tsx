"use client";

import React, { useCallback, useMemo, useState } from "react";
import {
  Wallet,
  TrendingUp,
  Hourglass,
  Package,
  AlertTriangle,
  BarChart3,
  CreditCard,
  Crown,
  Trophy,
  Receipt,
  Sparkles,
} from "lucide-react";
import { ReceiptModal } from "@/components/ReceiptModal";
import { formatRupiah } from "@/lib/utils";
import { useTransactions } from "@/hooks/useTransactions";
import type { Transaction } from "@/hooks/useTransactions";
import { useDashboard } from "@/features/dashboard/hooks/useDashboard";
import { StatTile } from "@/features/dashboard/components/StatTile";
import { SectionCard } from "@/features/dashboard/components/SectionCard";
import { RevenueTrendChart } from "@/features/dashboard/components/RevenueTrendChart";
import { PaymentMixCard } from "@/features/dashboard/components/PaymentMixCard";
import { ActiveDpList } from "@/features/dashboard/components/ActiveDpList";
import { TopProductsList } from "@/features/dashboard/components/TopProductsList";
import {
  RankList,
  formatRupiahLabel,
} from "@/features/dashboard/components/RankList";
import { RecentTransactionsList } from "@/features/dashboard/components/RecentTransactionsList";
import { LowStockList } from "@/features/dashboard/components/LowStockList";

function formatTodayLabel(): string {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

export default function DashboardPage() {
  const [selectedTransaction, setSelectedTransaction] =
    useState<Transaction | null>(null);

  const { data: dashboardData, isLoading: dashLoading } = useDashboard();
  const { data: transactions = [], isLoading: txLoading } = useTransactions();

  const handleSelectTransaction = useCallback((tx: Transaction) => {
    setSelectedTransaction(tx);
  }, []);

  const handleCloseReceipt = useCallback(() => {
    setSelectedTransaction(null);
  }, []);

  const todayLabel = useMemo(() => formatTodayLabel(), []);

  const todayMargin = useMemo(() => {
    const revenue = dashboardData?.todayRevenue ?? 0;
    const profit = dashboardData?.todayProfit ?? 0;
    return revenue > 0 ? (profit / revenue) * 100 : 0;
  }, [dashboardData?.todayRevenue, dashboardData?.todayProfit]);

  const monthlyMargin = useMemo(() => {
    const revenue = dashboardData?.monthlyRevenue ?? 0;
    const profit = dashboardData?.monthlyProfit ?? 0;
    return revenue > 0 ? (profit / revenue) * 100 : 0;
  }, [dashboardData?.monthlyRevenue, dashboardData?.monthlyProfit]);

  const lowStockCount = dashboardData?.lowStockProducts?.length ?? 0;

  const salesRows = useMemo(
    () =>
      (dashboardData?.topSalespersons ?? []).map((sp, idx) => ({
        key: `${sp.id ?? "sp"}-${idx}`,
        name: sp.name ?? "Tanpa nama",
        primaryValue: formatRupiahLabel(sp.revenue),
        hint: `${sp.txCount ?? 0} transaksi`,
      })),
    [dashboardData?.topSalespersons],
  );

  const customerRows = useMemo(
    () =>
      (dashboardData?.topCustomers ?? []).map((c, idx) => ({
        key: c.id ?? `cust-${idx}`,
        name: c.name ?? "Tanpa nama",
        primaryValue: formatRupiahLabel(c.totalSpent),
        hint: c.phone || "Tanpa nomor",
      })),
    [dashboardData?.topCustomers],
  );

  return (
    <>
      <main className="flex-1 overflow-y-auto bg-surface-50/40">
        <header className="sticky top-0 z-20 border-b border-surface-100 bg-white/85 backdrop-blur-md">
          <div className="px-4 py-4 md:px-8 md:py-5 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl md:text-2xl font-extrabold text-surface-900">
                Dashboard
              </h1>
              <p className="mt-1 text-sm text-surface-500">
                Ringkasan performa toko hari ini, {todayLabel}.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-100 bg-emerald-50/70 px-3 py-1 text-[11px] font-semibold text-emerald-700 md:self-auto">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 motion-safe:animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Live · refresh tiap 30 dtk
            </div>
          </div>
        </header>

        <div className="space-y-6 px-4 py-6 md:px-8">
          <section
            aria-label="Ringkasan KPI"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          >
            <StatTile
              label="Revenue Hari Ini"
              value={formatRupiah(dashboardData?.todayRevenue ?? 0)}
              hint={
                <>
                  Profit{" "}
                  <span className="font-semibold text-emerald-700">
                    {formatRupiah(dashboardData?.todayProfit ?? 0)}
                  </span>{" "}
                  · margin {todayMargin.toFixed(1)}%
                </>
              }
              tone="brand"
              loading={dashLoading}
              icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
            />
            <StatTile
              label="Revenue Bulan Ini"
              value={formatRupiah(dashboardData?.monthlyRevenue ?? 0)}
              hint={
                <>
                  Profit{" "}
                  <span className="font-semibold text-emerald-700">
                    {formatRupiah(dashboardData?.monthlyProfit ?? 0)}
                  </span>{" "}
                  · margin {monthlyMargin.toFixed(1)}%
                </>
              }
              tone="success"
              loading={dashLoading}
              icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
            />
            <StatTile
              label="Outstanding DP"
              value={formatRupiah(dashboardData?.totalOutstandingDP ?? 0)}
              hint={`${dashboardData?.dpTransactions?.length ?? 0} transaksi belum lunas`}
              tone="warning"
              loading={dashLoading}
              icon={<Hourglass className="h-4 w-4" aria-hidden="true" />}
            />
            <StatTile
              label="Total Produk"
              value={dashboardData?.totalProducts ?? 0}
              hint="Item aktif di katalog"
              tone="neutral"
              loading={dashLoading}
              icon={<Package className="h-4 w-4" aria-hidden="true" />}
            />
            <StatTile
              label="Stok Menipis"
              value={lowStockCount}
              hint={
                lowStockCount > 0
                  ? "Perlu restock segera"
                  : "Semua stok aman"
              }
              tone={lowStockCount > 0 ? "danger" : "success"}
              loading={dashLoading}
              icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            />
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <SectionCard
              className="xl:col-span-2"
              title="Tren Profit & Loss"
              subtitle="Performa 7 hari terakhir"
              accent="brand"
              icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
              action={
                <div className="flex gap-3 text-[10px] font-bold uppercase tracking-wider">
                  <span className="inline-flex items-center gap-1.5 text-brand-700">
                    <span className="h-2 w-2 rounded-full bg-brand-500" />
                    Revenue
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Profit
                  </span>
                </div>
              }
            >
              <RevenueTrendChart
                data={dashboardData?.revenueChart ?? []}
                loading={dashLoading}
              />
            </SectionCard>

            <SectionCard
              title="Mix Pembayaran"
              subtitle="Komposisi metode hari ini"
              accent="brand"
              icon={<CreditCard className="h-4 w-4" aria-hidden="true" />}
            >
              <PaymentMixCard
                rows={dashboardData?.paymentMixToday ?? []}
                loading={dashLoading}
              />
            </SectionCard>
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <SectionCard
              title="Sales Teratas"
              subtitle="Bulan berjalan"
              accent="brand"
              icon={<Trophy className="h-4 w-4" aria-hidden="true" />}
            >
              <RankList
                rows={salesRows}
                loading={dashLoading}
                emptyText="Belum ada data sales."
                accent="brand"
              />
            </SectionCard>

            <SectionCard
              title="Top Pelanggan"
              subtitle="30 hari terakhir"
              accent="warning"
              icon={<Crown className="h-4 w-4" aria-hidden="true" />}
            >
              <RankList
                rows={customerRows}
                loading={dashLoading}
                emptyText="Belum ada data pelanggan."
                accent="amber"
              />
            </SectionCard>

            <SectionCard
              title="Down Payment Aktif"
              subtitle={`${dashboardData?.dpTransactions?.length ?? 0} transaksi`}
              accent="warning"
              icon={<Hourglass className="h-4 w-4" aria-hidden="true" />}
            >
              <ActiveDpList
                data={dashboardData?.dpTransactions ?? []}
                loading={dashLoading}
                onSelect={handleSelectTransaction}
              />
            </SectionCard>
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-3">
            <SectionCard
              title="Produk Terlaris"
              subtitle="Sepanjang waktu"
              accent="warning"
              icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
            >
              <TopProductsList
                data={dashboardData?.topProducts ?? []}
                loading={dashLoading}
              />
            </SectionCard>

            <SectionCard
              title="Stok Menipis"
              subtitle={
                lowStockCount > 0
                  ? `${lowStockCount} produk perlu perhatian`
                  : "Semua stok aman"
              }
              accent={lowStockCount > 0 ? "danger" : "success"}
              icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            >
              <LowStockList
                data={dashboardData?.lowStockProducts ?? []}
                loading={dashLoading}
              />
            </SectionCard>

            <SectionCard
              title="Transaksi Terbaru"
              subtitle="Klik baris untuk melihat struk"
              accent="brand"
              icon={<Receipt className="h-4 w-4" aria-hidden="true" />}
              bodyClassName="px-0 py-1"
            >
              <RecentTransactionsList
                transactions={transactions}
                loading={txLoading}
                onSelect={handleSelectTransaction}
              />
            </SectionCard>
          </section>
        </div>
      </main>

      {selectedTransaction && (
        <ReceiptModal
          open={!!selectedTransaction}
          onClose={handleCloseReceipt}
          transaction={selectedTransaction}
        />
      )}
    </>
  );
}
