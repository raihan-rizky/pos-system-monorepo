"use client";

import React, { lazy, Suspense } from "react";
import { PackageOpen } from "lucide-react";
import { useCustomerDetailRecap } from "../hooks/useCustomerRecap";
import type { CustomerRecapQuery } from "../types/customer-recap";

const RecapTrendChart = lazy(() => import("./RecapTrendChart"));

interface CustomerRecapPanelProps {
  customerId: string;
  range: CustomerRecapQuery;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function CustomerRecapPanel({ customerId, range }: CustomerRecapPanelProps) {
  const { data } = useCustomerDetailRecap(customerId, range);

  return (
    <div className="mt-5 space-y-4 sm:mt-6">
      <div className="grid min-w-0 grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Belanja Periode
          </p>
          <p className="mt-2 break-words text-sm font-black text-slate-950">
            {formatCurrency(data.summary.totalSpent)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            Order
          </p>
          <p className="mt-2 text-sm font-black text-slate-950">
            {data.summary.totalOrders}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">
            Sisa Piutang
          </p>
          <p className="mt-2 break-words text-sm font-black text-amber-950">
            {formatCurrency(data.summary.debtRemaining)}
          </p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
            Terbayar
          </p>
          <p className="mt-2 break-words text-sm font-black text-emerald-950">
            {formatCurrency(data.summary.debtPaidInPeriod)}
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="h-64 rounded-2xl border border-slate-200 bg-slate-50" />
        }
      >
        <RecapTrendChart trend={data.trend} mode="detail" />
      </Suspense>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <PackageOpen className="h-4 w-4 text-slate-500" />
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
            Produk Teratas
          </p>
        </div>
        <div className="mt-3 divide-y divide-slate-100">
          {data.topProducts.length > 0 ? (
            data.topProducts.map((product) => (
              <div
                key={product.productId || product.productName}
                className="flex min-w-0 items-center justify-between gap-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">
                    {product.productName}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    {product.quantity} item
                  </p>
                </div>
                <p className="shrink-0 text-sm font-black text-slate-900">
                  {formatCurrency(product.subtotal)}
                </p>
              </div>
            ))
          ) : (
            <p className="py-6 text-sm text-slate-500">
              Belum ada produk pada periode ini.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default CustomerRecapPanel;
