"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CUSTOMER_TYPE_LABELS } from "@/lib/customers";
import type { CustomerRecapData } from "../types/customer-recap";

interface RecapByTypeChartProps {
  rows: CustomerRecapData["byType"];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function RecapByTypeChart({ rows }: RecapByTypeChartProps) {
  const data = rows.map((row) => ({
    ...row,
    label: CUSTOMER_TYPE_LABELS[row.type],
  }));

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
        Tipe Pelanggan
      </p>
      <h3 className="mt-1 text-sm font-black text-slate-900">
        Omzet dan piutang per tipe
      </h3>
      <div className="mt-4 h-64 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 12, right: 12 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={(value) => `${Number(value) / 1000}k`} />
            <YAxis dataKey="label" type="category" width={88} />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Bar dataKey="revenue" name="Omzet" fill="#2563eb" radius={[0, 6, 6, 0]} />
            <Bar dataKey="debtAmount" name="Piutang" fill="#f59e0b" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default RecapByTypeChart;
