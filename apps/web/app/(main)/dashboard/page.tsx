"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import { ReceiptModal } from "@/components/ReceiptModal";
import { Card } from "@pos/ui";
import { formatRupiah, formatDate } from "@/lib/utils";
import { useTransactions } from "@/hooks/useTransactions";
import type { Transaction } from "@/hooks/useTransactions";

const AreaChart = dynamic(() => import("recharts").then(mod => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import("recharts").then(mod => mod.Area), { ssr: false });
const XAxis = dynamic(() => import("recharts").then(mod => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then(mod => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then(mod => mod.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then(mod => mod.Tooltip), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then(mod => mod.ResponsiveContainer), { ssr: false });
const BarChart = dynamic(() => import("recharts").then(mod => mod.BarChart), { ssr: false });
const Bar = dynamic(() => import("recharts").then(mod => mod.Bar), { ssr: false });

interface DashboardData {
  todayRevenue: number;
  todayTransactionCount: number;
  monthlyRevenue: number;
  monthlyTransactionCount: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
  lowStockProducts: { id: string; name: string; stock: number; minStock: number; unit: string }[];
  totalProducts: number;
  revenueChart: { name: string; date: string; revenue: number }[];
}

export default function DashboardPage() {
  const [selectedTransaction, setSelectedTransaction] = React.useState<Transaction | null>(null);

  const { data: dashboardData, isLoading: dashLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/dashboard");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: transactions = [], isLoading: txLoading } = useTransactions();

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="px-8 pt-8 pb-4">
          <h1 className="text-2xl font-extrabold text-surface-900">Dashboard</h1>
          <p className="text-sm text-surface-400 mt-1">
            Ringkasan penjualan dan laporan toko
          </p>
        </header>

        <div className="px-8 pb-8 space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card glass className="animate-fade-in">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">
                    Pendapatan Hari Ini
                  </p>
                  <p className="text-2xl font-extrabold text-surface-900 mt-2">
                    {dashLoading ? "..." : formatRupiah(dashboardData?.todayRevenue || 0)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-success-50 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-surface-400 mt-2">
                {dashboardData?.todayTransactionCount || 0} transaksi
              </p>
            </Card>

            <Card glass className="animate-fade-in" style={{ animationDelay: "0.05s" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">
                    Pendapatan Bulan Ini
                  </p>
                  <p className="text-2xl font-extrabold text-surface-900 mt-2">
                    {dashLoading ? "..." : formatRupiah(dashboardData?.monthlyRevenue || 0)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0c98e9" strokeWidth="2">
                    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                    <polyline points="17 6 23 6 23 12" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-surface-400 mt-2">
                {dashboardData?.monthlyTransactionCount || 0} transaksi
              </p>
            </Card>

            <Card glass className="animate-fade-in" style={{ animationDelay: "0.1s" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">
                    Total Produk
                  </p>
                  <p className="text-2xl font-extrabold text-surface-900 mt-2">
                    {dashLoading ? "..." : dashboardData?.totalProducts || 0}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-accent-50 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97d12" strokeWidth="2">
                    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-surface-400 mt-2">produk aktif</p>
            </Card>

            <Card glass className="animate-fade-in" style={{ animationDelay: "0.15s" }}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">
                    Stok Rendah
                  </p>
                  <p className="text-2xl font-extrabold text-surface-900 mt-2">
                    {dashLoading ? "..." : dashboardData?.lowStockProducts?.length || 0}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-danger-50 flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </div>
              </div>
              <p className="text-xs text-danger-500 mt-2">perlu restock</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Revenue Trend Chart */}
            <Card className="col-span-1 lg:col-span-2">
              <div className="mb-6">
                <h2 className="text-base font-bold text-surface-900">📈 Tren Pendapatan</h2>
                <p className="text-sm text-surface-400">7 Hari Terakhir</p>
              </div>
              <div className="h-[300px] w-full mt-4">
                {dashLoading ? (
                  <div className="w-full h-full bg-surface-50 rounded-xl animate-pulse flex items-center justify-center">
                    <span className="text-surface-400">Memuat Grafik...</span>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={dashboardData?.revenueChart || []}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#0c98e9" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0c98e9" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 12 }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: "#94a3b8", fontSize: 12 }}
                        tickFormatter={(value: number) => `${value / 1000}k`}
                        dx={-10}
                      />
                      <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#fff",
                          borderRadius: "12px",
                          border: "1px solid #e2e8f0",
                          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
                        }}
                        labelStyle={{ fontWeight: "bold", color: "#0f172a", marginBottom: "4px" }}
                        formatter={(value: number | string) => {
                          const numValue = Number(value);
                          return [isNaN(numValue) ? value : formatRupiah(numValue), "Pendapatan"];
                        }}
                        labelFormatter={(label: string, payload: any[]) => {
                          if (payload && payload.length > 0) {
                            return `${label}, ${payload[0].payload.date}`;
                          }
                          return label;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        stroke="#0c98e9"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorRevenue)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Top Products */}
            <Card>
              <h2 className="text-base font-bold text-surface-900 mb-6">
                🔥 Produk Terlaris Volume
              </h2>
              {dashboardData?.topProducts?.length ? (
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dashboardData.topProducts.slice(0, 5)}
                      layout="vertical"
                      margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                    >
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        axisLine={false}
                        tickLine={false}
                        width={100}
                        tick={{ fill: "#475569", fontSize: 12 }}
                      />
                      <Tooltip
                        cursor={{ fill: "#f1f5f9" }}
                        contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)" }}
                        formatter={(value: number | string) => [`${value} terjual`, "Volume"]}
                      />
                      <Bar dataKey="quantity" fill="#f97d12" radius={[0, 4, 4, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-surface-400">Belum ada penjualan hari ini</p>
              )}
            </Card>

            {/* Low Stock Alert */}
            <Card>
              <h2 className="text-base font-bold text-surface-900 mb-4">
                ⚠️ Stok Rendah
              </h2>
              {dashboardData?.lowStockProducts?.length ? (
                <div className="space-y-3">
                  {dashboardData.lowStockProducts.map((product) => (
                    <div key={product.id} className="flex items-center justify-between">
                      <p className="text-sm font-medium text-surface-900 truncate">
                        {product.name}
                      </p>
                      <span
                        className={`
                          px-2.5 py-0.5 rounded-full text-xs font-semibold
                          ${product.stock <= 0
                            ? "bg-danger-50 text-danger-600"
                            : "bg-amber-50 text-amber-600"
                          }
                        `}
                      >
                        {product.stock} {product.unit}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-surface-400">Semua stok aman 👍</p>
              )}
            </Card>
          </div>

          {/* Recent Transactions */}
          <Card>
            <h2 className="text-base font-bold text-surface-900 mb-4">
              📋 Transaksi Terakhir
            </h2>
            {txLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-12 bg-surface-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : transactions.length === 0 ? (
              <p className="text-sm text-surface-400">Belum ada transaksi</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-100">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-surface-400 uppercase">Invoice</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-surface-400 uppercase">Waktu</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-surface-400 uppercase">Items</th>
                      <th className="text-left py-2 px-3 text-xs font-semibold text-surface-400 uppercase">Metode</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-surface-400 uppercase">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.slice(0, 10).map((txn) => (
                      <tr 
                        key={txn.id} 
                        className="border-b border-surface-50 hover:bg-surface-50 transition-colors cursor-pointer"
                        onClick={() => setSelectedTransaction(txn)}
                      >
                        <td className="py-2.5 px-3 font-mono text-xs text-brand-600">{txn.invoiceNumber}</td>
                        <td className="py-2.5 px-3 text-surface-500">{formatDate(txn.createdAt)}</td>
                        <td className="py-2.5 px-3 text-surface-500">{txn.items.length} item</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-surface-100 text-surface-600">
                            {txn.paymentMethod}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-surface-900">
                          {formatRupiah(Number(txn.total))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </main>

      {/* Receipt Modal for viewing/printing past transactions */}
      {selectedTransaction && (
        <ReceiptModal
          open={!!selectedTransaction}
          onClose={() => setSelectedTransaction(null)}
          transaction={selectedTransaction}
        />
      )}
    </>
  );
}
