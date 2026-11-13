"use client";

import { useEffect, useRef, useState } from "react";
import { formatRupiahPrecise } from "@/lib/utils";
import { parseComparisonAmounts, snapshotPaymentMethods, type ComparisonAmount, type ComparisonMethod } from "../helpers/daily-comparison";
import { ComparisonRequestError, useDailyIncomeComparison, type SavedDailyIncomeComparison } from "../hooks/useDailyIncomeComparison";

type Props = {
  date: string;
  methods: Array<{ method: string; amount: number }>;
  access: { read: boolean; create: boolean; update: boolean };
  previewSales: boolean;
  onSaved: () => void;
};
const METHODS: ComparisonMethod[] = ["CASH", "TRANSFER", "DEBIT", "CREDIT", "QRIS"];
const LABELS: Record<ComparisonMethod, string> = { CASH: "Tunai", TRANSFER: "Transfer", DEBIT: "Debit", CREDIT: "Kredit", QRIS: "QRIS" };
const asDraft = (amounts: ComparisonAmount[]) => Object.fromEntries(amounts.map(item => [item.method, item.amount])) as Partial<Record<ComparisonMethod, string>>;

export function DailyIncomeComparison({ date, methods, access, previewSales, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<SavedDailyIncomeComparison | null>(null);
  const [draft, setDraft] = useState<Partial<Record<ComparisonMethod, string>>>({});
  const [dirty, setDirty] = useState<Set<ComparisonMethod>>(() => new Set());
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [reviewLatest, setReviewLatest] = useState(false);
  const initialized = useRef(false);
  const editVersion = useRef<Partial<Record<ComparisonMethod, number>>>({});
  const { query, save } = useDailyIncomeComparison(date, previewSales, open && access.read);

  useEffect(() => {
    if (!query.isSuccess || initialized.current) return;
    initialized.current = true;
    setSaved(query.data.comparison);
    setDraft(asDraft(query.data.comparison?.amounts ?? []));
  }, [query.data, query.isSuccess]);

  const canWrite = !previewSales && (saved ? access.update : access.create);
  const available = new Set(methods.map(item => item.method));
  const shown = METHODS.filter(method => available.has(method) || Object.prototype.hasOwnProperty.call(draft, method) || saved?.amounts.some(item => item.method === method));
  const checked = shown.filter(method => (draft[method] ?? "").trim() !== "").length;
  const posChanged = saved && JSON.stringify(saved.posAtSave) !== JSON.stringify(snapshotPaymentMethods(methods));
  const unrecorded = methods.find(item => item.method === "Belum dicatat" && item.amount > 0);

  async function submit() {
    const amounts = parseComparisonAmounts(shown.flatMap(method => (draft[method] ?? "").trim() ? [{ method, amount: draft[method]!.trim() }] : []));
    if (!amounts) { setSaveError("Periksa nominal aktual: gunakan angka nol atau lebih dengan maksimal dua angka desimal."); return; }
    setSaveError("");
    const submittedVersions = { ...editVersion.current };
    try {
      const result = await save.mutateAsync({ date, revision: saved?.revision ?? null, amounts });
      setSaved(result.comparison);
      const savedDraft = asDraft(result.comparison.amounts);
      setDraft(current => {
        const next = { ...savedDraft };
        for (const method of METHODS) {
          if (editVersion.current[method] !== submittedVersions[method]) next[method] = current[method];
        }
        return next;
      });
      setDirty(current => {
        const next = new Set(current);
        for (const method of METHODS) if (editVersion.current[method] === submittedVersions[method]) next.delete(method);
        return next;
      });
      setConflict(false); setReviewLatest(false);
      onSaved();
    } catch (error) {
      setConflict(error instanceof ComparisonRequestError && error.status === 409);
      setSaveError(error instanceof Error ? error.message : "Pemeriksaan belum dapat disimpan.");
    }
  }

  async function loadLatest() {
    const startingDraft = { ...draft };
    const dirtyAtStart = new Set(dirty);
    const result = await query.refetch();
    if (!result.data) { setSaveError("Versi terbaru belum dapat dimuat. Coba lagi."); return; }
    const latest = result.data.comparison;
    setDraft(current => {
      const merged = asDraft(latest?.amounts ?? []);
      for (const method of METHODS) {
        if (dirtyAtStart.has(method) || current[method] !== startingDraft[method]) merged[method] = current[method] ?? "";
      }
      return merged;
    });
    setSaved(latest); setConflict(false); setSaveError(""); setReviewLatest(true);
  }

  return <details onToggle={event => setOpen(event.currentTarget.open)} className="overflow-hidden rounded-xl border border-[#dce9ed]">
    <summary className="cursor-pointer bg-[#f1f7fb] px-4 py-3 text-sm font-bold text-[#17384a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">Cocokkan penerimaan <span className="ml-1 font-normal text-[#587586]">· Opsional</span></summary>
    {open && <div className="space-y-3 p-4 text-sm">
      <p className="text-xs text-[#587586]">Bandingkan penerimaan pada tanggal pilihan, tanpa modal awal atau pengeluaran.</p>
      {query.isLoading || !initialized.current && !query.error ? <p role="status" className="text-[#587586]">Memuat pemeriksaan...</p> : query.error ? <div role="alert" className="text-red-700">{query.error.message} <button type="button" onClick={() => void query.refetch()} className="min-h-11 font-semibold underline">Coba lagi</button></div> : <>
        {posChanged && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Data POS berubah sejak pemeriksaan terakhir. Periksa kembali selisihnya.</p>}
        {unrecorded && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Sebagian pemasukan belum memiliki metode pembayaran, sehingga belum dapat dicocokkan.</p>}
        {reviewLatest && <p className="rounded-lg bg-[#f1f7fb] p-3 text-xs text-[#385e70]">Versi terbaru dimuat. Nominal yang Anda ubah tetap ada; bandingkan dengan nilai tersimpan sebelum menyimpan.</p>}
        {shown.length === 0 ? <p className="text-[#587586]">Belum ada metode pembayaran pada tanggal ini.</p> : <ul className="divide-y divide-[#e5eef2] border-y border-[#e5eef2]">{shown.map(method => {
          const expected = methods.find(item => item.method === method)?.amount ?? 0;
          const value = draft[method] ?? "";
          const parsed = value.trim() ? parseComparisonAmounts([{ method, amount: value.trim() }]) : null;
          const difference = parsed ? (Math.round(Number(parsed[0].amount) * 100) - Math.round(expected * 100)) / 100 : null;
          const status = !value.trim() ? "Belum dicek" : difference === null ? "Periksa nominal" : difference === 0 ? "Sesuai" : `${difference < 0 ? "Kurang" : "Lebih"} ${formatRupiahPrecise(Math.abs(difference))}`;
          const latest = saved?.amounts.find(item => item.method === method);
          return <li key={method} className="grid gap-2 py-3 sm:grid-cols-[1fr_1fr_1.2fr_1fr] sm:items-center">
            <strong>{LABELS[method]}</strong>
            <div><span className="block text-xs text-[#587586]">Menurut POS</span><span className="font-mono font-semibold tabular-nums">{formatRupiahPrecise(expected)}</span></div>
            {canWrite ? <label className="block text-xs text-[#587586]">Aktual (Rp)<input aria-label={`Aktual ${LABELS[method]} (Rp)`} type="number" inputMode="decimal" min="0" max="9999999999.99" step="0.01" value={value} onChange={event => { const next = event.target.value; editVersion.current[method] = (editVersion.current[method] ?? 0) + 1; setDraft(current => ({ ...current, [method]: next })); setDirty(current => new Set(current).add(method)); if (!conflict) setSaveError(""); }} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[#b8ced8] bg-white px-2 text-base text-[#17384a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700" /></label> : <div><span className="block text-xs text-[#587586]">Aktual</span><span className="font-mono tabular-nums">{parsed ? formatRupiahPrecise(Number(parsed[0].amount)) : "Belum dicek"}</span></div>}
            <div><span className="block text-xs text-[#587586]">Selisih</span><span className={`font-semibold ${difference === 0 ? "text-emerald-700" : difference !== null ? "text-amber-800" : "text-[#587586]"}`}>{status}</span></div>
            {reviewLatest && <p className="text-xs text-[#587586] sm:col-span-4">Tersimpan: {latest ? formatRupiahPrecise(Number(latest.amount)) : "Belum dicek"}</p>}
          </li>;
        })}</ul>}
        {canWrite && shown.length < METHODS.length && <label className="block text-xs text-[#587586]">Tambah metode pembayaran<select aria-label="Tambah metode pembayaran" value="" onChange={event => { const method = event.target.value as ComparisonMethod; if (method) { editVersion.current[method] = (editVersion.current[method] ?? 0) + 1; setDraft(current => ({ ...current, [method]: "" })); setDirty(current => new Set(current).add(method)); } }} className="mt-1 block min-h-11 w-full rounded-lg border border-[#b8ced8] bg-white px-2 text-sm text-[#17384a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700"><option value="">Pilih metode</option>{METHODS.filter(method => !shown.includes(method)).map(method => <option key={method} value={method}>{LABELS[method]}</option>)}</select></label>}
        <p className="text-xs text-[#587586]">{checked} dari {shown.length} metode dicek{unrecorded ? "; ada metode yang belum dicatat" : ""}.</p>
        {saved && <p className="text-xs text-[#587586]">Terakhir disimpan oleh {saved.savedBy} · {new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(saved.savedAt))} WIB</p>}
        {saveError && <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{saveError} {conflict && <button type="button" onClick={() => void loadLatest()} className="min-h-11 font-semibold underline">Muat versi terbaru</button>}</div>}
        {canWrite && <button type="button" disabled={save.isPending || conflict} onClick={() => void submit()} className="min-h-11 rounded-lg bg-[#073149] px-4 font-semibold text-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">{save.isPending ? "Menyimpan..." : "Simpan pemeriksaan"}</button>}
      </>}
    </div>}
  </details>;
}
