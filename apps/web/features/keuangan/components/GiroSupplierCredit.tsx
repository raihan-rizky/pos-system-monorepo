"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@pos/ui";
import { formatRupiah } from "@/lib/utils";
import { parseAmount } from "../helpers/supplier-payable-input";

type CreditBalance = {
  remainingCents: number;
  credits: Array<{ id: string; reference: string; remainingCents: number }>;
};

export function GiroSupplierCredit({ payableId, disabled, control, onBusy, onApplied }: {
  payableId: string;
  disabled: boolean;
  control: string;
  onBusy: (busy: boolean) => void;
  onApplied: () => Promise<void>;
}) {
  const endpoint = `/api/finance/supplier-payables/${encodeURIComponent(payableId)}/credits`;
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [creditId, setCreditId] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const pending = useRef<{ creditId: string; amountCents: number; requestId: string } | null>(null);
  const read = useRef<AbortController | null>(null);
  const saving = useRef(false);
  useEffect(() => () => read.current?.abort(), []);

  const selected = balance?.credits.find(credit => credit.id === creditId);
  const limit = Math.min(selected?.remainingCents ?? 0, balance?.remainingCents ?? 0);
  const amountCents = Math.round((parseAmount(amount) ?? 0) * 100);

  async function load() {
    if (read.current) return;
    const controller = new AbortController();
    read.current = controller;
    setLoading(true);
    setLoadError(false);
    try {
      const response = await fetch(endpoint, { signal: controller.signal });
      if (response.status === 404) setBalance({ remainingCents: 0, credits: [] });
      else if (response.ok) setBalance((await response.json()).data);
      else setLoadError(true);
    } catch {
      if (!controller.signal.aborted) setLoadError(true);
    } finally {
      read.current = null;
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  async function apply() {
    if (disabled || saving.current || !creditId || amountCents <= 0 || amountCents > limit) return;
    if (pending.current?.creditId !== creditId || pending.current.amountCents !== amountCents) {
      pending.current = { creditId, amountCents, requestId: crypto.randomUUID() };
    }
    saving.current = true;
    onBusy(true);
    setApplying(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.current),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        if (response.status === 409) await load();
        setError(body?.message ?? "Kredit belum dapat digunakan. Silakan coba lagi.");
        return;
      }
      await onApplied();
    } catch {
      setError("Hasil pemakaian kredit belum dapat dipastikan. Coba lagi dengan isian yang sama.");
    } finally {
      saving.current = false;
      onBusy(false);
      setApplying(false);
    }
  }

  return <details className="mx-5 mb-5 rounded-xl border border-surface-200 bg-surface-50"
    onToggle={event => { if (event.currentTarget.open && !balance && !loading) void load(); }}>
    <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-500">Pakai kredit pemasok</summary>
    <form className="space-y-3 px-4 pb-4" onSubmit={event => { event.preventDefault(); void apply(); }} aria-busy={applying || loading}>
      {loading && <p role="status" className="text-sm text-surface-600">Memuat kredit pemasok...</p>}
      {loadError && <button type="button" onClick={() => void load()} className="min-h-11 text-sm font-medium text-brand-700 underline">Muat ulang kredit pemasok</button>}
      {balance && !loading && (!balance.credits.length || balance.remainingCents <= 0) &&
        <p className="text-sm text-surface-600">Belum ada kredit yang dapat dipakai untuk giro ini.</p>}
      {Boolean(balance?.credits.length && balance.remainingCents > 0) && <fieldset disabled={disabled || applying || loading} className="space-y-3">
        <label className="block text-sm font-medium">Kredit yang tersedia
          <select required value={creditId} onChange={event => { setCreditId(event.target.value); setAmount(""); }} className={control}>
            <option value="">Pilih kredit</option>
            {balance?.credits.map(credit => <option key={credit.id} value={credit.id}>{credit.reference} · {formatRupiah(credit.remainingCents / 100)}</option>)}
          </select>
        </label>
        {selected && <label className="block text-sm font-medium">Nominal kredit (Rp)
          <input required type="number" min="0.01" max={limit / 100} step="0.01" inputMode="decimal" value={amount}
            onChange={event => setAmount(event.target.value)} className={control} />
          <span className="mt-1 block text-xs text-surface-600">Maksimal {formatRupiah(limit / 100)}</span>
        </label>}
        <Button type="submit" variant="secondary" loading={applying} disabled={amountCents <= 0 || amountCents > limit}>Gunakan kredit</Button>
      </fieldset>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </form>
  </details>;
}
