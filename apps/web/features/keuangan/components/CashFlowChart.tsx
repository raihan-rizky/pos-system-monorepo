"use client";

import React from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ExpenseSummary,
  IncomeSummary,
} from "@/features/keuangan/hooks/useKeuangan";
import { formatRupiah } from "@/lib/utils";

const FLOW_COLOR_INCOME = "#10B981";
const FLOW_COLOR_EXPENSE = "#EF4444";

function shortDay(date: string) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit" }).format(
    new Date(`${date}T00:00:00+07:00`),
  );
}

function fullDay(date: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00+07:00`));
}

export function CashFlowChart({
  incomeDaily,
  expenseDaily,
  loading,
}: {
  incomeDaily: IncomeSummary["daily"] | undefined;
  expenseDaily: ExpenseSummary["daily"] | undefined;
  loading: boolean;
}) {
  const flowData = React.useMemo(() => {
    const rows = new Map<
      string,
      { date: string; income: number; expense: number }
    >();

    incomeDaily?.forEach((item) => {
      rows.set(item.date, {
        date: item.date,
        income: item.total,
        expense: 0,
      });
    });
    expenseDaily?.forEach((item) => {
      const existing = rows.get(item.date) ?? {
        date: item.date,
        income: 0,
        expense: 0,
      };
      existing.expense = -item.total;
      rows.set(item.date, existing);
    });

    return [...rows.values()].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
  }, [expenseDaily, incomeDaily]);

  if (loading) {
    return (
      <div className="h-full w-full rounded-xl bg-surface-100 animate-pulse" />
    );
  }

  if (flowData.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-surface-500">
        Belum ada aktivitas bulan ini
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={flowData}
        margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
        stackOffset="sign"
      >
        <CartesianGrid
          strokeDasharray="3 3"
          vertical={false}
          stroke="#E2E8F0"
        />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "#64748B" }}
          tickFormatter={shortDay}
          axisLine={{ stroke: "#CBD5E1" }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={12}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748B" }}
          tickFormatter={(value) => {
            const numericValue = Number(value);
            const absoluteValue = Math.abs(numericValue);
            if (absoluteValue >= 1_000_000) {
              return `${(numericValue / 1_000_000).toFixed(0)}jt`;
            }
            if (absoluteValue >= 1_000) {
              return `${(numericValue / 1_000).toFixed(0)}rb`;
            }
            return String(numericValue);
          }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          cursor={{ fill: "#F1F5F9" }}
          contentStyle={{
            borderRadius: 12,
            border: "1px solid #E2E8F0",
            fontSize: 12,
          }}
          formatter={(value, name) => [
            formatRupiah(Math.abs(Number(value ?? 0))),
            name === "income" ? "Pemasukan" : "Pengeluaran",
          ]}
          labelFormatter={(date) => fullDay(String(date))}
        />
        <ReferenceLine y={0} stroke="#0F172A" strokeWidth={1.5} />
        <Bar
          dataKey="income"
          fill={FLOW_COLOR_INCOME}
          radius={[4, 4, 0, 0]}
          isAnimationActive={false}
        />
        <Bar
          dataKey="expense"
          fill={FLOW_COLOR_EXPENSE}
          radius={[0, 0, 4, 4]}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

