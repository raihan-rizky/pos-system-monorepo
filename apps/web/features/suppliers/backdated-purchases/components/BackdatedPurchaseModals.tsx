"use client";

import React, { useState } from "react";
import { Button, Modal } from "@pos/ui";
import { useQueryClient } from "@tanstack/react-query";
import { backdatedJakartaToday, parseBackdatedPaymentInput, parseBackdatedPurchaseInput } from "../helpers/backdated-purchase-input";
import type { BackdatedPurchaseListItem } from "../../shopping-requests/types/shopping-request";

type PaymentDraft = { requestId: string; amount: string; paidAt: string };
type PurchaseDraft = { requestId: string; purchaseDate: string; paymentMethod: "GIRO" | "TRANSFER"; dueDate: string; reference: string; amount: string; payments: PaymentDraft[] };
const purchaseDraftKey = "backdated-purchase:pending";
function readPendingPurchase(): PurchaseDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.sessionStorage.getItem(purchaseDraftKey) || "null");
    if (!value || typeof value.requestId !== "string" || typeof value.purchaseDate !== "string" ||
      (value.paymentMethod !== "GIRO" && value.paymentMethod !== "TRANSFER") || typeof value.dueDate !== "string" ||
      typeof value.reference !== "string" || typeof value.amount !== "string" || !Array.isArray(value.payments)) return null;
    return value;
  } catch { return null; }
}
function clearPendingPurchase() {
  try { window.sessionStorage.removeItem(purchaseDraftKey); } catch { /* A stale key safely retries the same request. */ }
}
const paymentDraftKey = (purchaseId: string) => `backdated-payment:${purchaseId}`;
function readPendingPayment(purchaseId: string | undefined): PaymentDraft | null {
  if (!purchaseId || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(paymentDraftKey(purchaseId));
    if (!raw) return null;
    const value = JSON.parse(raw);
    return typeof value.requestId === "string" && typeof value.amount === "string" && typeof value.paidAt === "string" ? value : null;
  } catch { return null; }
}
function clearPendingPayment(purchaseId: string) {
  try { window.sessionStorage.removeItem(paymentDraftKey(purchaseId)); } catch { /* A stale key safely retries the same request. */ }
}
const newId = () => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
};
const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base";
const money = (cents: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 }).format(cents / 100);
const localDate = (date: string) => date.split("-").reverse().join("/");

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new PostError(payload.message || "Penyimpanan gagal. Coba lagi.", response.status);
  return payload;
}

class PostError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function BackdatedPurchaseCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [pending] = useState(readPendingPurchase);
  const [requestId, setRequestId] = useState(() => pending?.requestId ?? newId());
  const [purchaseDate, setPurchaseDate] = useState(() => pending?.purchaseDate ?? "");
  const [paymentMethod, setPaymentMethod] = useState<"GIRO" | "TRANSFER">(() => pending?.paymentMethod ?? "GIRO");
  const [dueDate, setDueDate] = useState(() => pending?.dueDate ?? "");
  const [reference, setReference] = useState(() => pending?.reference ?? "");
  const [amount, setAmount] = useState(() => pending?.amount ?? "");
  const [payments, setPayments] = useState<PaymentDraft[]>(() => pending?.payments ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(!!pending);
  const today = backdatedJakartaToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const maxPurchaseDate = new Date(new Date(`${monthStart}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const body = submitted ? readPendingPurchase() : { requestId, purchaseDate, paymentMethod, dueDate, reference, amount, payments };
    if (!body) { setError("Data permintaan belum tersedia. Muat ulang halaman dan coba lagi."); return; }
    try {
      if (!submitted) parseBackdatedPurchaseInput(body);
      try { window.sessionStorage.setItem(purchaseDraftKey, JSON.stringify(body)); }
      catch { throw new Error("Penyimpanan sementara tidak tersedia. Aktifkan penyimpanan browser dan coba lagi."); }
      setError(null);
      setSaving(true);
      setSubmitted(true);
      await postJson("/api/suppliers/backdated-purchases", body);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["shopping-requests"] }), queryClient.invalidateQueries({ queryKey: ["finance"] }), queryClient.invalidateQueries({ queryKey: ["financial-report"] })]);
      clearPendingPurchase();
      setRequestId(newId()); setPurchaseDate(""); setPaymentMethod("GIRO"); setDueDate(""); setReference(""); setAmount(""); setPayments([]);
      setSubmitted(false);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Penyimpanan gagal. Coba lagi.");
      if (!submitted && cause instanceof PostError && cause.status >= 400 && cause.status < 500) {
        clearPendingPurchase();
        setSubmitted(false);
        setRequestId(newId());
      }
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["shopping-requests"] }), queryClient.invalidateQueries({ queryKey: ["finance"] }), queryClient.invalidateQueries({ queryKey: ["financial-report"] })]);
    } finally { setSaving(false); }
  };

  return <Modal open={open} onClose={onClose} title="Catat Belanja Terdahulu" size="lg">
    <form onSubmit={save} className="space-y-4">
      <p className="text-sm text-slate-600">Catat pembelian dari bulan sebelumnya tanpa menambah stok barang.</p>
      <fieldset disabled={submitted}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">Tanggal Pembelian<input name="purchaseDate" type="date" required max={maxPurchaseDate} value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} className={inputClass} /></label>
        <label className="space-y-1 text-sm font-semibold">Metode Pembayaran<select name="paymentMethod" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as "GIRO" | "TRANSFER")} className={inputClass}><option value="GIRO">Giro</option><option value="TRANSFER">Transfer</option></select></label>
        <label className="space-y-1 text-sm font-semibold">Tanggal Jatuh Tempo<input name="dueDate" type="date" required min={purchaseDate || undefined} value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputClass} /></label>
        <label className="space-y-1 text-sm font-semibold">{paymentMethod === "GIRO" ? "No. Giro" : "No. Transaksi"}<input name="reference" required maxLength={160} value={reference} onChange={e => setReference(e.target.value)} className={inputClass} /></label>
        <label className="space-y-1 text-sm font-semibold sm:col-span-2">Nominal Pembelian (Rp)<input name="amount" type="number" inputMode="decimal" required min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} /></label>
      </div>
      <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold">Pembayaran yang sudah dilakukan</legend>
        {payments.map((payment, index) => <div key={payment.requestId} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="space-y-1 text-sm">Nominal {index + 1} (Rp)<input name={`payment-amount-${index}`} type="number" min="0.01" step="0.01" required value={payment.amount} onChange={e => setPayments(rows => rows.map(row => row.requestId === payment.requestId ? { ...row, amount: e.target.value } : row))} className={inputClass} /></label>
          <label className="space-y-1 text-sm">Tanggal pembayaran {index + 1}<input name={`payment-date-${index}`} type="date" min={purchaseDate || undefined} max={today} required value={payment.paidAt} onChange={e => setPayments(rows => rows.map(row => row.requestId === payment.requestId ? { ...row, paidAt: e.target.value } : row))} className={inputClass} /></label>
          <Button type="button" variant="secondary" onClick={() => setPayments(rows => rows.filter(row => row.requestId !== payment.requestId))}>Hapus</Button>
        </div>)}
        <Button type="button" variant="secondary" onClick={() => setPayments(rows => [...rows, { requestId: newId(), amount: "", paidAt: "" }])}>Tambah pembayaran sebelumnya</Button>
      </fieldset>
      </fieldset>
      <p className="text-sm text-slate-600">Pembayaran sampai jatuh tempo dicatat sesuai tanggalnya. Sisa pada jatuh tempo masuk ke keuangan secara otomatis.</p>
      {submitted && !saving && <p className="text-sm text-slate-600">Status penyimpanan belum pasti. Coba simpan lagi dengan data yang sama.</p>}
      {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Batal</Button><Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan belanja"}</Button></div>
    </form>
  </Modal>;
}

export function BackdatedPurchasePaymentsModal({ purchase, canPay, onClose }: { purchase: BackdatedPurchaseListItem | null; canPay: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [pending] = useState(() => readPendingPayment(purchase?.id));
  const [requestId, setRequestId] = useState(() => pending?.requestId ?? newId());
  const [amount, setAmount] = useState(() => pending?.amount ?? "");
  const [paidAt, setPaidAt] = useState(() => pending?.paidAt ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(!!pending);
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!purchase || saving) return;
    const body = { requestId, amount, paidAt };
    try {
      if (!submitted) {
        const parsed = parseBackdatedPaymentInput(body, purchase.purchaseDate);
        if (parsed.amountCents > purchase.remainingCents) throw new Error("Pembayaran tidak boleh melebihi sisa tagihan.");
      }
      try { window.sessionStorage.setItem(paymentDraftKey(purchase.id), JSON.stringify(body)); }
      catch { throw new Error("Penyimpanan sementara tidak tersedia. Aktifkan penyimpanan browser dan coba lagi."); }
      setError(null); setSaving(true);
      setSubmitted(true);
      await postJson(`/api/suppliers/backdated-purchases/${purchase.id}/payments`, body);
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["shopping-requests"] }), queryClient.invalidateQueries({ queryKey: ["finance"] }), queryClient.invalidateQueries({ queryKey: ["financial-report"] })]);
      clearPendingPayment(purchase.id);
      setRequestId(newId()); setAmount(""); setPaidAt(""); setSubmitted(false); onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Penyimpanan gagal. Coba lagi.");
      if (!submitted && cause instanceof PostError && cause.status >= 400 && cause.status < 500) {
        clearPendingPayment(purchase.id);
        setSubmitted(false);
        setRequestId(newId());
      }
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["shopping-requests"] }), queryClient.invalidateQueries({ queryKey: ["finance"] }), queryClient.invalidateQueries({ queryKey: ["financial-report"] })]);
    }
    finally { setSaving(false); }
  };
  return <Modal open={!!purchase} onClose={onClose} title="Riwayat Pembayaran" size="lg">
    {purchase && <div className="space-y-4">
      <p className="text-sm text-slate-700">{purchase.reference} · Sisa tagihan <strong>{money(purchase.remainingCents)}</strong></p>
      {purchase.payments.length === 0 ? <p className="text-sm text-slate-500">Belum ada pembayaran.</p> : <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">{purchase.payments.map(payment => <li key={payment.id} className="flex justify-between gap-2 p-3 text-sm"><span>{localDate(payment.paidAt)}</span><span>{money(payment.amountCents)}</span></li>)}</ul>}
      {canPay && (purchase.remainingCents > 0 || submitted) && <form onSubmit={save} className="space-y-3"><div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold">Nominal Pembayaran (Rp)<input type="number" required min="0.01" step="0.01" value={amount} readOnly={submitted} onChange={e => setAmount(e.target.value)} className={inputClass} /></label>
        <label className="space-y-1 text-sm font-semibold">Tanggal Pembayaran<input type="date" required min={purchase.purchaseDate} max={backdatedJakartaToday()} value={paidAt} readOnly={submitted} onChange={e => setPaidAt(e.target.value)} className={inputClass} /></label>
      </div><p className="text-sm text-slate-600">Pembayaran setelah jatuh tempo mengurangi tagihan tanpa mencatat pengeluaran kedua.</p>
        {submitted && !saving && <p className="text-sm text-slate-600">Status pembayaran belum pasti. Coba simpan lagi dengan data yang sama.</p>}
        {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
        <Button type="submit" disabled={saving}>{saving ? "Menyimpan..." : "Simpan pembayaran"}</Button>
      </form>}
    </div>}
  </Modal>;
}

export function BackdatedPurchaseCard({ purchase, onPayments }: { purchase: BackdatedPurchaseListItem; onPayments: () => void }) {
  const status = { UNPAID: "Belum dibayar", PARTIAL: "Dibayar sebagian", PAID: "Lunas" }[purchase.paymentStatus];
  return <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2"><h3 className="break-words font-bold text-slate-950">{purchase.reference}</h3><span className="rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800">Belanja terdahulu</span><span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">{status}</span></div>
      <p className="text-sm text-slate-600">Pembelian {localDate(purchase.purchaseDate)} · {purchase.paymentMethod === "GIRO" ? "Giro" : "Transfer"} · Jatuh tempo {localDate(purchase.dueDate)}</p>
      <p className="text-sm text-slate-700">Nominal {money(purchase.amountCents)} · Dibayar {money(purchase.paidCents)} · Sisa <strong>{money(purchase.remainingCents)}</strong></p>
    </div><Button type="button" variant="secondary" onClick={onPayments}>Riwayat pembayaran</Button></div>
  </article>;
}
