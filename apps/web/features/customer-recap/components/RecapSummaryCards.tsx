"use client";

import {
  CheckCircle,
  Receipt,
  RotateCcw,
  UserMinus,
  UserPlus,
  Wallet,
} from "lucide-react";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import type { CustomerRecapData } from "../types/customer-recap";

interface RecapSummaryCardsProps {
  summary: CustomerRecapData["summary"];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

const toneMap = {
  brand: "border-brand-200 bg-brand-50 text-brand-950",
  sky: "border-sky-200 bg-sky-50 text-sky-950",
  danger: "border-red-200 bg-red-50 text-red-950",
  warning: "border-amber-200 bg-amber-50 text-amber-950",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  neutral: "border-slate-200 bg-slate-50 text-slate-950",
} as const;

export function RecapSummaryCards({ summary }: RecapSummaryCardsProps) {
  const cards = [
    {
      label: "Pelanggan Baru",
      value: String(summary.newCustomers),
      icon: <UserPlus className="h-5 w-5" />,
      tone: "brand" as const,
      info: "Jumlah pelanggan yang baru terdaftar pada periode ini.",
    },
    {
      label: "Pelanggan Kembali",
      value: String(summary.returningCustomers),
      icon: <RotateCcw className="h-5 w-5" />,
      tone: "sky" as const,
      info: "Jumlah pelanggan lama yang kembali melakukan transaksi pada periode ini.",
    },
    {
      label: "Risiko Churn",
      value: String(summary.churnedCustomers),
      icon: <UserMinus className="h-5 w-5" />,
      tone: "danger" as const,
      info: "Jumlah pelanggan lama yang sudah tidak melakukan transaksi dalam 60 hari terakhir sebelum akhir periode ini.",
    },
    {
      label: "Piutang Total",
      value: formatCurrency(summary.totalDebtOutstanding),
      icon: <Wallet className="h-5 w-5" />,
      tone: "warning" as const,
      info: "Total sisa piutang dari semua pelanggan pada periode ini.",
    },
    {
      label: "Piutang Terbayar",
      value: formatCurrency(summary.debtCollectedInPeriod),
      icon: <CheckCircle className="h-5 w-5" />,
      tone: "success" as const,
      info: "Total nominal piutang yang berhasil ditagih atau dibayarkan pada periode ini.",
    },
    {
      label: "Rata-rata Belanja",
      value: formatCurrency(summary.avgOrderValue),
      icon: <Receipt className="h-5 w-5" />,
      tone: "neutral" as const,
      info: "Rata-rata nominal per transaksi pada periode ini.",
    },
  ];

  return (
    <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`min-w-0 rounded-2xl border p-3 ${toneMap[card.tone]}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-current/60">
                  {card.label}
                </p>
                {card.info && <InfoTooltip title={card.label} description={card.info} />}
              </div>
              <p className="mt-2 break-words text-base font-black leading-tight">
                {card.value}
              </p>
            </div>
            <div className="shrink-0 text-current/70">{card.icon}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default RecapSummaryCards;
