"use client";

import { CUSTOMER_TYPE_LABELS } from "@/lib/customers";
import type { CustomerRecapData } from "../types/customer-recap";

interface RecapTopSpendersProps {
  customers: CustomerRecapData["topSpenders"];
  onSelectCustomer: (customerId: string) => void;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function RecapTopSpenders({
  customers,
  onSelectCustomer,
}: RecapTopSpendersProps) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
            Top Spender
          </p>
          <h3 className="mt-1 text-sm font-black text-slate-900">
            Pelanggan dengan belanja terbesar
          </h3>
        </div>
      </div>
      <div className="mt-3 divide-y divide-slate-100">
        {customers.length > 0 ? (
          customers.map((customer, index) => (
            <button
              key={customer.id}
              type="button"
              onClick={() => onSelectCustomer(customer.id)}
              className="flex w-full min-w-0 items-center gap-3 py-3 text-left transition hover:bg-slate-50"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-black text-white">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black text-slate-900">
                  {customer.name}
                </span>
                <span className="mt-1 block text-xs font-semibold text-slate-500">
                  {CUSTOMER_TYPE_LABELS[customer.type]} · {customer.orderCount} order
                </span>
              </span>
              <span className="shrink-0 text-right text-sm font-black text-slate-900">
                {formatCurrency(customer.spentInPeriod)}
              </span>
            </button>
          ))
        ) : (
          <p className="py-6 text-sm text-slate-500">
            Belum ada transaksi pada periode ini.
          </p>
        )}
      </div>
    </div>
  );
}

export default RecapTopSpenders;
