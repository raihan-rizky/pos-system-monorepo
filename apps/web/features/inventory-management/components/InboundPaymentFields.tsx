"use client";

import React from "react";
import type { InboundPaymentInput } from "../types/inventory-management";

const money = (value: number) => `Rp ${value.toLocaleString("id-ID", { maximumFractionDigits: 2 })}`;
const dateLabel = (date: string) => date.slice(0, 10).split("-").reverse().join("/");
const inputClass = "mt-1 block min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-normal text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700 disabled:bg-slate-100";

export function InboundPaymentSummary({ payments }: { payments: InboundPaymentInput[] }) {
  if (!payments.length) return null;
  return <div className="space-y-2 text-sm text-slate-700" aria-label="Rincian pembayaran">
    {payments.map((payment, index) => <div key={index} className="flex flex-wrap justify-between gap-x-4 gap-y-1">
      <span className="font-semibold">{payment.method === "GIRO" ? "Giro" : "Transfer"} {index + 1}: {money(payment.amount)}</span>
      {payment.method === "GIRO" && payment.dueDate && <span>Jatuh tempo {dateLabel(payment.dueDate)}</span>}
      {payment.note && <p className="w-full break-words text-xs text-slate-600">{payment.note}</p>}
    </div>)}
  </div>;
}

export function InboundPaymentFields({ payments, totalAmount, disabled = false, onChange }: {
  payments: InboundPaymentInput[];
  totalAmount: number;
  disabled?: boolean;
  onChange: (payments: InboundPaymentInput[]) => void;
}) {
  const update = (index: number, patch: Partial<InboundPaymentInput>) =>
    onChange(payments.map((row, candidate) => candidate === index ? { ...row, ...patch } : row));
  const allocated = payments.reduce((sum, row) => sum + Math.round((row.amount || 0) * 100), 0) / 100;
  const remaining = (Math.round(totalAmount * 100) - Math.round(allocated * 100)) / 100;
  return <fieldset disabled={disabled} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
    <legend className="px-1 text-sm font-bold text-slate-800">Pembayaran Pembelian</legend>
    <p className="text-sm text-slate-600">Bagi nominal ke beberapa giro dengan tanggal jatuh tempo masing-masing. Totalnya harus sesuai nilai pembelian.</p>
    {payments.map((payment, index) => <fieldset key={index} className="rounded-lg border border-slate-200 bg-white p-3">
      <legend className="px-1 text-sm font-semibold text-slate-800">Pembayaran {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Metode Pembayaran {index + 1}
          <select name={index === 0 ? "paymentMethod" : `payments.${index}.method`} className={inputClass}
            value={payment.method} onChange={event => update(index, { method: event.target.value as InboundPaymentInput["method"], dueDate: null })}>
            <option value="TRANSFER">Transfer</option><option value="GIRO">Giro</option>
          </select>
        </label>
        <label className="text-sm font-semibold text-slate-700">Nominal Pembayaran {index + 1}
          <input name={`payments.${index}.amount`} type="number" inputMode="decimal" min="0.01" max="9999999999.99" step="0.01" required className={inputClass}
            value={payment.amount || ""} onChange={event => update(index, { amount: Number(event.target.value) })} />
        </label>
        {payment.method === "GIRO" && <label className="text-sm font-semibold text-slate-700">Tanggal Jatuh Tempo {index + 1}
          <input name={index === 0 ? "paymentDueDate" : `payments.${index}.dueDate`} type="date" required className={inputClass}
            value={payment.dueDate ?? ""} onChange={event => update(index, { dueDate: event.target.value })} />
        </label>}
        <label className="text-sm font-semibold text-slate-700">Catatan Pembayaran {index + 1} (opsional)
          <input name={`payments.${index}.note`} maxLength={500} className={inputClass} value={payment.note ?? ""}
            onChange={event => update(index, { note: event.target.value })} />
        </label>
      </div>
      {!disabled && payments.length > 1 && <button type="button" className="mt-2 min-h-12 rounded-lg px-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-700"
        onClick={() => onChange(payments.filter((_, candidate) => candidate !== index))}>Hapus Pembayaran {index + 1}</button>}
    </fieldset>)}
    {!disabled && payments.length < 50 && <button type="button" className="min-h-12 rounded-lg border border-cyan-700 bg-white px-4 text-sm font-semibold text-cyan-800 hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700"
      onClick={() => onChange([...payments, { method: "GIRO", amount: Math.max(0, remaining), dueDate: null, note: null }])}>Tambah Giro</button>}
    <dl className="space-y-1 text-sm tabular-nums">
      <div className="flex justify-between gap-3"><dt>Total Pembelian</dt><dd>{money(totalAmount)}</dd></div>
      <div className="flex justify-between gap-3"><dt>Total Pembayaran</dt><dd className="font-semibold">{money(allocated)}</dd></div>
      <div className={`flex justify-between gap-3 ${remaining === 0 ? "text-emerald-800" : "font-semibold text-amber-800"}`}><dt>{remaining < 0 ? "Kelebihan alokasi" : "Sisa alokasi"}</dt><dd>{money(Math.abs(remaining))}</dd></div>
    </dl>
    <p className="text-xs text-slate-600">{disabled ? "Pembayaran sudah ditetapkan dan digunakan kembali pada penerimaan berikutnya." : "Pengeluaran pembelian dicatat saat penerimaan pertama disetujui."}</p>
  </fieldset>;
}
