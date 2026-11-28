"use client";

import React, { useEffect, useRef, useState } from "react";
import { Decimal } from "@pos/db/decimal";
import { Modal } from "@pos/ui";
import { formatRupiahPrecise } from "@/lib/utils";
import type { Product } from "@/hooks/useProducts";
import { SupplierSelector } from "@/features/suppliers/components/SupplierSelector";
import { InboundPaymentFields } from "@/features/inventory-management/components/InboundPaymentFields";
import { validateInboundPayments } from "@/features/inventory-management/helpers/inbound-payment";
import type { InboundPaymentInput } from "@/features/inventory-management/types/inventory-management";
import { ProductAutocomplete } from "./ProductAutocomplete";
import { useCorrectionEditor, usePreviewCorrection, useSaveCorrection } from "../hooks/useShoppingRequestCorrection";
import type { ShoppingRequestCorrectionEditor } from "../repositories/shopping-request-correction-editor";
import type { CorrectionPreview, ShoppingRequestCorrectionInput } from "../types/shopping-request-correction";
import { CorrectionPaymentComparison, correctionDate, correctionMethodLabel, correctionMoney } from "./CorrectionPaymentComparison";
import styles from "./ShoppingRequestCorrectionModal.module.css";

const control = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";
const action = "min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50";
const money = formatRupiahPrecise;
type EditorItem = ShoppingRequestCorrectionEditor["items"][number];
type PaymentDraft = { keys: string[]; allocations: ShoppingRequestCorrectionInput["payment"]["allocations"]; corrections: ShoppingRequestCorrectionInput["payment"]["corrections"] };
type ScheduleDraft = { method: "TRANSFER" | "GIRO" | null; dueDate: string; schedule: InboundPaymentInput[] | undefined };
const paymentSourceKey = (source: { sourceKind: string; paymentId: string }) => JSON.stringify([source.sourceKind, source.paymentId]);
const scheduleDraftFromEditor = (editor: ShoppingRequestCorrectionEditor): ScheduleDraft => ({
  method: editor.payment.method, dueDate: editor.payment.dueDate ?? "",
  schedule: editor.payment.schedule?.length ? editor.payment.schedule.map(row => ({ ...row, amount: Number(row.amount) })) : undefined,
});
const scheduleDraftKey = ({ method, dueDate, schedule }: ScheduleDraft) => JSON.stringify(schedule?.length
  ? schedule.map(row => [row.method, Math.round(row.amount * 100), row.dueDate || null, row.note?.trim() || null])
  : [method, dueDate || null]);

export function CorrectionDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.activeElement as HTMLElement);
  useEffect(() => {
    const dialog = container.current?.closest<HTMLElement>('[role="dialog"]');
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const elements = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? [])
        .filter(element => element.getClientRects().length > 0);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog?.addEventListener("keydown", trapFocus);
    const opener = returnFocus.current;
    return () => {
      dialog?.removeEventListener("keydown", trapFocus);
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return <Modal open onClose={onClose} title={title} size="4xl"><div ref={container}>{children}</div></Modal>;
}

export function ShoppingRequestCorrectionModal({ requestId, onClose, initialSection = "details" }: { requestId: string; onClose: () => void; initialSection?: "details" | "payment" }) {
  const editor = useCorrectionEditor(requestId);
  return <CorrectionDialog title={initialSection === "payment" ? "Ubah pembayaran" : "Edit daftar belanja"} onClose={onClose}>
    {editor.isPending && <p role="status">Memuat data terbaru…</p>}
    {editor.isError && <div role="alert"><p>{editor.error.message}</p><button type="button" className={action} onClick={() => editor.refetch()}>Muat ulang</button></div>}
    {editor.data && <ShoppingRequestCorrectionForm key={requestId} editor={editor.data} onClose={onClose} initialSection={initialSection} onReload={async () => {
      const result = await editor.refetch();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("Data terbaru belum tersedia. Coba lagi.");
      return result.data;
    }} />}
  </CorrectionDialog>;
}

export function ShoppingRequestCorrectionForm({ editor: initialEditor, onClose, initialSection = "details", onReload }: { editor: ShoppingRequestCorrectionEditor; onClose: () => void; initialSection?: "details" | "payment"; onReload?: () => Promise<ShoppingRequestCorrectionEditor> }) {
  const [editor, setEditor] = useState(initialEditor);
  const [header, setHeader] = useState(editor.header);
  const [items, setItems] = useState(editor.items);
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState(editor.payment.method);
  const [dueDate, setDueDate] = useState(editor.payment.dueDate ?? "");
  const [schedule, setSchedule] = useState<InboundPaymentInput[] | undefined>(() => editor.payment.schedule?.length ? editor.payment.schedule.map(row => ({ ...row, amount: Number(row.amount) })) : undefined);
  const [allocations, setAllocations] = useState<ShoppingRequestCorrectionInput["payment"]["allocations"]>(() => editor.payment.allocations);
  const [corrections, setCorrections] = useState<ShoppingRequestCorrectionInput["payment"]["corrections"]>([]);
  const [catalog, setCatalog] = useState<ShoppingRequestCorrectionInput["catalog"]>([]);
  const [stage, setStage] = useState<"edit" | "catalog" | "review">("edit");
  const [review, setReview] = useState<{ preview: CorrectionPreview; input: ShoppingRequestCorrectionInput } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft | null>(null);
  const [adding, setAdding] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [previewedDraft, setPreviewedDraft] = useState<{ signature: string; key: string } | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLHeadingElement>(null);
  const paymentRef = useRef<HTMLElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (!errorRef.current) stageRef.current?.focus(); }, [stage]);
  useEffect(() => {
    if (initialSection === "payment") paymentRef.current?.focus();
  }, [initialSection]);
  const previewMutation = usePreviewCorrection(editor.requestId);
  const saveMutation = useSaveCorrection(editor.requestId);
  const busy = adding || refreshing || previewMutation.isPending || saveMutation.isPending;
  const paymentError = error && /jadwal|alokasi|giro|pembayaran/i.test(error) ? error : null;
  const hasReceipts = editor.items.some(item => item.receipts.length) || items.some(item => item.receipts.some(receipt => receipt.receivedQty > 0));
  const purchaseUnchanged = JSON.stringify(header) === JSON.stringify(editor.header) && JSON.stringify(items) === JSON.stringify(editor.items) &&
    !catalog.some(entry => entry.costPrice !== null || entry.salePrice !== null);
  const scheduledTotal = purchaseUnchanged ? Number(editor.totalAmount) : items.reduce((sum, item) => {
    const quantity = hasReceipts ? item.receipts.reduce((qty, receipt) => qty.plus(String(receipt.receivedQty)), new Decimal(0)).toNumber() : item.orderedQty;
    return sum.plus(new Decimal(item.unitPrice || "0").mul(String(quantity)).toDecimalPlaces(2, Decimal.ROUND_HALF_UP));
  }, new Decimal(0)).toNumber();
  const plannedPayments = schedule ?? (method ? [{ method, amount: scheduledTotal, dueDate: dueDate || null, note: null }] : []);
  const plannedTransfer = plannedPayments.filter(row => row.method === "TRANSFER").reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
  const plannedGiro = plannedPayments.filter(row => row.method === "GIRO").reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
  const giroDates = plannedPayments.filter(row => row.method === "GIRO").map(row => row.dueDate).filter((date): date is string => Boolean(date));
  const recordedTransfer = allocations.filter(row => row.method === "TRANSFER").reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
  const recordedGiro = allocations.filter(row => row.method === "GIRO").reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
  const transferOverPlan = recordedTransfer > Math.round(plannedTransfer * 100);
  const giroOverPlan = recordedGiro > Math.round(plannedGiro * 100);
  const singleGiro = plannedPayments.length === 1 && plannedPayments[0].method === "GIRO" ? plannedPayments[0] : null;
  const giroAfterTransfer = (Math.round(scheduledTotal * 100) - recordedTransfer) / 100;
  const canSuggestSchedule = singleGiro?.dueDate && transferOverPlan && recordedGiro === 0 && giroAfterTransfer > 0;
  const changedPrices = items.filter(item => !editor.items.some(old => old.clientLineKey === item.clientLineKey && old.productId === item.productId && Number(old.unitPrice) === Number(item.unitPrice)));
  const productName = (id: string) => items.find(item => item.productId === id)?.productName ?? editor.items.find(item => item.productId === id)?.productName ?? "Barang";
  const patchItem = (key: string, patch: Partial<EditorItem>) => setItems(current => current.map(item => item.clientLineKey === key ? { ...item, ...patch } : item));
  const patchHeader = (field: keyof typeof header, value: string) => setHeader(current => ({ ...current, [field]: value || null }));
  const addProduct = async (product: Product) => {
    if (items.some(item => item.productId === product.id) || adding) return;
    setAdding(true); setError(null);
    try {
      const response = await fetch(`/api/products/${encodeURIComponent(product.id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Data produk belum dapat dimuat. Coba pilih kembali.");
      const { data } = await response.json();
      setItems(current => [...current, {
        clientLineKey: crypto.randomUUID(), requestItemId: null, purchaseItemId: null, productId: product.id,
        productName: product.name, sku: product.sku, unit: product.unit, requestedQty: 1, approvedQty: 1, orderedQty: 1,
        unitPrice: String(data.costPrice ?? 0), receipts: [{ receiptLineId: null, receivedQty: 0 }],
        catalogCostPrice: data.costPrice === null ? null : String(data.costPrice), catalogSalePrice: String(data.price), catalogUpdatedAt: data.updatedAt,
      }]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Produk belum dapat ditambahkan."); }
    finally { setAdding(false); }
  };
  const loadPreview = async () => {
    if (!reason.trim() || busy) return;
    setError(null); setConflict(false);
    try {
      if (schedule) {
        try { validateInboundPayments(scheduledTotal, schedule, { allowEstablishedZeroRows: true }); }
        catch (cause) {
          const message = cause instanceof Error ? cause.message : "Periksa jadwal pembayaran.";
          throw new Error(message.startsWith("Total pembayaran") ? "Total jadwal harus sesuai dengan total pembelian. Sesuaikan nominal jadwal." : message);
        }
      } else if (method === "GIRO" && !dueDate) throw new Error("Tanggal jatuh tempo Giro wajib diisi.");
      for (const source of editor.payment.sources) {
        const correction = corrections.find(entry => entry.paymentId === source.paymentId && entry.sourceKind === source.sourceKind);
        const amount = Number(correction?.amount ?? source.amount);
        const allocated = allocations.filter(entry => entry.paymentId === source.paymentId && entry.sourceKind === source.sourceKind)
          .reduce((sum, entry) => sum + Math.round(Number(entry.amount) * 100), 0);
        if (!Number.isFinite(amount) || !Number.isFinite(allocated) || allocated !== Math.round(amount * 100)) {
          throw new Error("Jumlah alokasi harus sama dengan nominal pembayaran tercatat. Periksa alokasi Transfer dan Giro.");
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Periksa jadwal dan alokasi pembayaran.");
      setStage("edit");
      return;
    }
    const input: ShoppingRequestCorrectionInput = {
      idempotencyKey, expectedVersion: editor.version, reason: reason.trim(),
      header: { ...header, name: header.name?.trim() ?? "", number: header.number?.trim() ?? "" },
      items: items.map(({ clientLineKey, requestItemId, purchaseItemId, productId, unit, requestedQty, approvedQty, orderedQty, unitPrice, receipts }) => ({ clientLineKey, requestItemId, purchaseItemId, productId, unit, requestedQty, approvedQty, orderedQty, unitPrice, receipts })),
      payment: { method, dueDate: dueDate || null, ...(schedule ? { schedule: schedule.map(row => ({ ...row, amount: row.amount.toFixed(2), dueDate: row.dueDate ?? null, note: row.note ?? null })) } : {}), allocations: allocations.filter(entry => Number(entry.amount) > 0), corrections },
      catalog: catalog.filter(entry => items.some(item => item.productId === entry.productId) && (entry.costPrice !== null || entry.salePrice !== null)),
    };
    const signature = JSON.stringify({ ...input, idempotencyKey: undefined });
    const key = previewedDraft && previewedDraft.signature !== signature ? crypto.randomUUID() : previewedDraft?.key ?? idempotencyKey;
    input.idempotencyKey = key;
    setIdempotencyKey(key); setPreviewedDraft({ signature, key });
    try { const preview = await previewMutation.mutateAsync(input); setReview({ preview, input: { ...input, expectedPreviewVersion: preview.version } }); setStage("review"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Dampak perubahan belum dapat ditinjau."); setConflict(cause instanceof Error && "status" in cause && cause.status === 409); setStage("edit"); }
  };
  const save = async () => {
    if (!review || busy) return;
    setError(null);
    try { await saveMutation.mutateAsync(review.input); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Perubahan belum dapat disimpan."); setConflict(cause instanceof Error && "status" in cause && cause.status === 409); }
  };
  const reloadLatest = async () => {
    if (!onReload || busy) return;
    setRefreshing(true);
    try {
      const latest = await onReload();
      const originalSchedule = scheduleDraftFromEditor(editor);
      const latestSchedule = scheduleDraftFromEditor(latest);
      const ownSchedule = { method, dueDate, schedule };
      const ownChanged = scheduleDraftKey(ownSchedule) !== scheduleDraftKey(originalSchedule);
      const latestChanged = scheduleDraftKey(latestSchedule) !== scheduleDraftKey(originalSchedule);
      if (!ownChanged || scheduleDraftKey(ownSchedule) === scheduleDraftKey(latestSchedule)) {
        setMethod(latestSchedule.method); setDueDate(latestSchedule.dueDate); setSchedule(latestSchedule.schedule); setScheduleDraft(null);
      } else if (latestChanged) {
        setScheduleDraft(ownSchedule);
        setMethod(latestSchedule.method); setDueDate(latestSchedule.dueDate); setSchedule(latestSchedule.schedule);
      } else setScheduleDraft(null);
      const changedKeys = new Set(corrections.map(paymentSourceKey));
      for (const source of editor.payment.sources) {
        const key = paymentSourceKey(source);
        const values = (rows: ShoppingRequestCorrectionInput["payment"]["allocations"]) => rows.filter(row => paymentSourceKey(row) === key).map(row => `${row.method}:${Number(row.amount)}`).sort();
        if (JSON.stringify(values(editor.payment.allocations)) !== JSON.stringify(values(allocations))) changedKeys.add(key);
      }
      setPaymentDraft(changedKeys.size ? { keys: [...changedKeys], allocations: allocations.filter(row => changedKeys.has(paymentSourceKey(row))), corrections: corrections.filter(row => changedKeys.has(paymentSourceKey(row))) } : null);
      setEditor(latest); setHeader(latest.header); setItems(latest.items);
      if (initialSection === "details") setCatalog([]);
      setAllocations(latest.payment.allocations); setCorrections([]);
      setReview(null); setStage("edit"); setIdempotencyKey(crypto.randomUUID());
      setError(null); setConflict(false); setConfirmReload(false);
      setRefreshNotice("Data terbaru dimuat. Alasan Anda tetap tersedia; periksa jadwal dan pembayaran tercatat sebelum meninjau dampak.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Data terbaru belum dapat dimuat. Coba lagi."); }
    finally { setRefreshing(false); }
  };
  const reapplyPaymentDraft = () => {
    if (!paymentDraft) return;
    const available = new Set(editor.payment.sources.map(paymentSourceKey));
    if (paymentDraft.keys.some(key => !available.has(key))) return;
    setAllocations(current => [...current.filter(row => !paymentDraft.keys.includes(paymentSourceKey(row))), ...paymentDraft.allocations]);
    setCorrections(current => [...current.filter(row => !paymentDraft.keys.includes(paymentSourceKey(row))), ...paymentDraft.corrections]);
    setPaymentDraft(null);
    setRefreshNotice("Koreksi Anda diterapkan kembali pada data terbaru. Periksa nominal dan alokasi, lalu tinjau dampak.");
  };
  const selectCatalog = (item: EditorItem, field: "costPrice" | "salePrice", value: string | null) => setCatalog(current => {
    const entry = current.find(entry => entry.productId === item.productId) ?? { productId: item.productId, costPrice: null, salePrice: null, expectedUpdatedAt: item.catalogUpdatedAt };
    return [...current.filter(entry => entry.productId !== item.productId), { ...entry, [field]: value }];
  });
  return <div className={`${styles.correction} space-y-4`}>
    <ol aria-label="Tahap koreksi" className="flex flex-wrap gap-4 border-b border-slate-200 pb-3 text-sm font-semibold">
      <li aria-current={stage === "edit" ? "step" : undefined} className={stage === "edit" ? "text-cyan-800" : "text-slate-600"}>1. Edit data</li>
      {stage === "catalog" && <li aria-current="step" className="text-cyan-800">Pilihan harga katalog</li>}
      <li aria-current={stage === "review" ? "step" : undefined} className={stage === "review" ? "text-cyan-800" : "text-slate-600"}>2. Tinjau dampak</li>
    </ol>
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-700"><p className="font-semibold">{stage === "review" ? "Perubahan belum tersimpan" : "Periksa data koreksi"}</p><p className="mt-1">{error}</p><p className="mt-2">Isian Anda tetap tersedia.</p>{conflict && onReload && <button type="button" className={`${action} mt-2`} disabled={busy} onClick={() => initialSection === "payment" ? reloadLatest() : setConfirmReload(true)}>Muat data terbaru</button>}{stage === "edit" && <button type="button" className={`${action} mt-2`} onClick={() => paymentRef.current?.focus()}>Periksa pembayaran</button>}</div>}
    {confirmReload && <section aria-label="Konfirmasi data terbaru" className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <h3 className="font-semibold">Periksa perubahan sebelum memuat ulang</h3>
      <p>Data daftar, barang, dan pilihan katalog akan dimuat ulang dari server. Salin perubahan penting sebelum melanjutkan. Alasan dan perubahan jadwal pembayaran Anda tetap tersedia untuk diperiksa.</p>
      <div className="flex flex-wrap gap-2"><button type="button" className={action} disabled={busy} onClick={() => { setConfirmReload(false); setError(null); }}>Kembali periksa isian</button><button type="button" className={action} disabled={busy} onClick={reloadLatest}>Lanjut muat data terbaru</button></div>
    </section>}
    {refreshNotice && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{refreshNotice}</p>}
    {scheduleDraft && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p>Jadwal berubah saat Anda mengedit. Jadwal terbaru ditampilkan; jadwal Anda sebelumnya:</p>
      <ul className="list-inside list-disc">{scheduleDraft.schedule?.length ? scheduleDraft.schedule.map((row, index) => <li key={index}>{row.method === "GIRO" ? "Giro" : "Transfer"} {money(String(row.amount))}{row.dueDate && ` · ${correctionDate(row.dueDate)}`}</li>) : <li>{scheduleDraft.method === "GIRO" ? "Giro" : scheduleDraft.method === "TRANSFER" ? "Transfer" : "Belum ditentukan"}{scheduleDraft.dueDate && ` · ${correctionDate(scheduleDraft.dueDate)}`}</li>}</ul>
      <button type="button" className={action} onClick={() => { setMethod(scheduleDraft.method); setDueDate(scheduleDraft.dueDate); setSchedule(scheduleDraft.schedule); setScheduleDraft(null); }}>Gunakan kembali jadwal saya</button>
    </div>}
    {paymentDraft && <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
      <p>Koreksi pembayaran tercatat Anda belum diterapkan pada data terbaru. Periksa kembali sebelum menggunakannya.</p>
      <ul className="list-inside list-disc">{paymentDraft.corrections.map((row, index) => <li key={`correction-${index}`}>Nominal {money(row.amount)} · tanggal {correctionDate(row.paidAt)}</li>)}{paymentDraft.allocations.map((row, index) => <li key={`allocation-${index}`}>Alokasi {row.method === "GIRO" ? "Giro" : "Transfer"} {money(row.amount)}</li>)}</ul>
      {paymentDraft.keys.some(key => !editor.payment.sources.some(source => paymentSourceKey(source) === key)) && <p>Sebagian sumber pembayaran tidak lagi tersedia. Periksa riwayat sebelum mengoreksi kembali.</p>}
      <button type="button" className={action} disabled={paymentDraft.keys.some(key => !editor.payment.sources.some(source => paymentSourceKey(source) === key))} onClick={reapplyPaymentDraft}>Gunakan kembali koreksi saya</button>
    </div>}
    {stage === "edit" && <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (changedPrices.length) setStage("catalog"); else void loadPreview(); }}>
      <h3 ref={stageRef} tabIndex={-1} className="text-lg font-bold">{initialSection === "payment" ? "Periksa dan ubah pembayaran" : "Perbaiki data daftar belanja"}</h3>
      <p className="rounded-lg bg-cyan-50 p-3 text-sm text-cyan-950">{purchaseUnchanged ? "Koreksi pembayaran mempertahankan total pembelian yang tersimpan." : "Koreksi barang dapat mengubah total berdasarkan jumlah yang benar-benar diterima."}{initialSection === "details" && " Mengubah kebutuhan atau pesanan saja tidak menambah stok."}</p>
      {editor.pendingReceipts.length > 0 && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">Ada penerimaan yang menunggu persetujuan. Anda tetap dapat mengubah pembayaran; selesaikan penerimaan sebelum mengoreksi barang terkait.</p>}
      <fieldset disabled={busy} className="space-y-4">
        {initialSection === "details" && <>
        <legend className="font-bold">Data daftar dan pembelian</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>Nama daftar<input autoFocus required className={control} aria-label="Nama daftar" value={header.name ?? ""} onChange={e => patchHeader("name", e.target.value)} /></label>
          <label>Nomor daftar<input required className={control} aria-label="Nomor daftar" value={header.number ?? ""} onChange={e => patchHeader("number", e.target.value)} /></label>
          <label>Tanggal usaha<input required type="date" className={control} aria-label="Tanggal usaha" value={header.businessDate} onChange={e => patchHeader("businessDate", e.target.value)} /></label>
          <label>Pemohon<input className={control} aria-label="Pemohon" value={header.requestedByName ?? ""} onChange={e => patchHeader("requestedByName", e.target.value)} /></label>
        </div>
        <SupplierSelector value={header.supplierId ?? ""} onChange={value => patchHeader("supplierId", value)} />
        <label className="block">Catatan<textarea className={control} aria-label="Catatan" value={header.note ?? ""} onChange={e => patchHeader("note", e.target.value)} /></label>
        <h3 className="font-bold">Barang</h3>
        {items.map(item => <fieldset key={item.clientLineKey} className="min-w-0 space-y-3 rounded-xl border border-slate-200 p-3">
          <legend className="max-w-full break-words px-1 font-semibold">{item.productName} · {item.sku}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label>Satuan<input readOnly className={control} aria-label={`Satuan ${item.productName}`} value={item.unit ?? ""} /></label>
            {([ ["requestedQty", "Kebutuhan"], ["approvedQty", "Disetujui"], ["orderedQty", "Dipesan"] ] as const).map(([field, label]) => <label key={field}>{label}<input type="number" min="0" step="any" required={field !== "approvedQty"} className={control} aria-label={`${label} ${item.productName}`} value={item[field] ?? ""} onChange={e => patchItem(item.clientLineKey, { [field]: field === "approvedQty" && e.target.value === "" ? null : Number(e.target.value) })} /></label>)}
            <label>Harga beli<input type="number" min="0" step="0.01" required className={control} aria-label={`Harga beli ${item.productName}`} value={item.unitPrice} onChange={e => patchItem(item.clientLineKey, { unitPrice: e.target.value })} /></label>
          </div>
          {editor.items.some(old => old.clientLineKey === item.clientLineKey && old.unitPrice !== item.unitPrice) && <p className="text-sm font-semibold text-amber-800">Harga beli diubah · Sebelumnya {money(editor.items.find(old => old.clientLineKey === item.clientLineKey)!.unitPrice)}</p>}
          <div className="grid gap-3 sm:grid-cols-2">{item.receipts.map((receipt, index) => <label key={receipt.receiptLineId ?? `new-${index}`}>{receipt.receiptLineId ? `Diterima · penerimaan ${index + 1}` : "Tambahan yang benar-benar diterima"}<input type="number" min="0" step="any" required className={control} aria-label={`Diterima ${item.productName} penerimaan ${index + 1}`} value={receipt.receivedQty} onChange={e => patchItem(item.clientLineKey, { receipts: item.receipts.map((entry, i) => i === index ? { ...entry, receivedQty: Number(e.target.value) } : entry) })} /></label>)}</div>
          {!item.receipts.some(receipt => receipt.receiptLineId === null) && <button type="button" className={action} onClick={() => patchItem(item.clientLineKey, { receipts: [...item.receipts, { receiptLineId: null, receivedQty: 0 }] })}>Tambah jumlah diterima</button>}
          <button type="button" className={`${action} text-rose-800`} onClick={() => { setItems(current => current.filter(entry => entry.clientLineKey !== item.clientLineKey)); setCatalog(current => current.filter(entry => entry.productId !== item.productId)); }}>Hapus barang</button>
        </fieldset>)}
        <details className="rounded-xl border p-3"><summary className="min-h-11 cursor-pointer font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600">Tambah barang</summary><ProductAutocomplete onSelect={product => { void addProduct(product); }} /><p className="mt-2 text-sm text-slate-600">Untuk mengganti produk atau satuan, hapus barang lama lalu tambahkan produk dengan satuan yang benar dari katalog. Isi ulang jumlah yang benar-benar diterima; jumlah barang baru dimulai dari nol. Stok dihitung dari selisih bersih seluruh barang.</p></details>
        </>}
        <section ref={paymentRef} tabIndex={-1} aria-labelledby="correction-payment-title" className="space-y-3 rounded-xl border border-slate-200 p-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-700">
        <h3 id="correction-payment-title" className="font-bold">Jadwal pembayaran</h3>
        {editor.expenseMismatch && <p role="status" className={`${styles.warning} rounded-lg border p-3 text-sm`}>Nilai pengeluaran tercatat tidak sesuai dengan total pembelian. Laporan terkait mungkin belum lengkap; periksa catatan pengeluaran secara terpisah.</p>}
        <p role="status" className={`${styles.warning} rounded-lg border p-3 text-sm`}>Perubahan pembayaran dapat memengaruhi utang dan laporan.{editor.pendingReceipts.length > 0 && " Ada penerimaan yang menunggu, tetapi Anda tetap dapat mengubah pembayaran."}</p>
        <p className="text-sm text-slate-600">Perubahan ini membetulkan catatan. Tidak ada pemindahan uang atau pengembalian uang otomatis.</p>
        {(transferOverPlan || giroOverPlan) && <div className={`${styles.warning} space-y-2 rounded-lg border p-3 text-sm`}>
          <div role="status">
            {transferOverPlan && <p>Transfer tercatat {money(recordedTransfer / 100)}. Jadwal Transfer {money(plannedTransfer)}.</p>}
            {giroOverPlan && <p>Giro tercatat {money(recordedGiro / 100)}. Jadwal Giro {money(plannedGiro)}.</p>}
          </div>
          {canSuggestSchedule && singleGiro && <>
            <p>Jika Giro hanya untuk sisanya, jadwalkan Transfer {money(recordedTransfer / 100)} dan Giro {money(giroAfterTransfer)}.</p>
            <button type="button" className={action} onClick={() => {
              setSchedule([
                { method: "TRANSFER", amount: recordedTransfer / 100, dueDate: null, note: null },
                { ...singleGiro, amount: giroAfterTransfer },
              ]);
              setError(null);
            }}>Pakai saran jadwal</button>
          </>}
        </div>}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.75fr)]">
        <div className="space-y-3">
        {!schedule && <div className="grid gap-3 sm:grid-cols-2"><label>Metode pembayaran<select className={control} aria-label="Metode pembayaran" value={method ?? ""} onChange={e => {
          const next = e.target.value as typeof method || null;
          setMethod(next);
          if (next !== "GIRO") setDueDate("");
          setError(null);
        }}><option value="">Belum ditentukan</option><option value="TRANSFER">Transfer</option><option value="GIRO">Giro</option></select></label>{method === "GIRO" && <label>Jatuh tempo<input type="date" className={control} aria-label="Jatuh tempo" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label>}</div>}
        {schedule ? <InboundPaymentFields payments={schedule} totalAmount={scheduledTotal} allowZeroAmounts context="correction" error={paymentError?.includes("alokasi") ? null : paymentError} onChange={value => { setSchedule(value); setError(null); }} /> : <button type="button" className={action} onClick={() => setSchedule([{ method: method ?? "TRANSFER", amount: scheduledTotal, dueDate: method === "GIRO" ? dueDate || null : null, note: null }])}>Atur rincian Transfer dan Giro</button>}
        <p className="text-sm text-slate-600">Rincian jadwal adalah rencana pembayaran. Pembayaran yang sudah terjadi tetap dicatat terpisah di bawah.</p>
        </div>
        <aside aria-label="Ringkasan perubahan" className={`${styles.summary} order-first rounded-xl border p-4 text-sm lg:order-none`}>
          <h4 className="font-bold">Ringkasan perubahan</h4>
          <p className="mt-3 text-xs font-semibold uppercase">Total pembelian</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{money(String(scheduledTotal))}</p>
          <dl className="mt-4 space-y-2 border-t border-emerald-200 pt-4 tabular-nums">
            <div className="flex justify-between gap-3"><dt>Transfer</dt><dd className="font-semibold">{money(String(plannedTransfer))}</dd></div>
            <div className="flex justify-between gap-3"><dt>Giro</dt><dd className="font-semibold">{money(String(plannedGiro))}</dd></div>
            <div className="flex justify-between gap-3"><dt>Selisih jadwal dari total</dt><dd className="font-semibold">{money(String((Math.round(scheduledTotal * 100) - Math.round(plannedTransfer * 100) - Math.round(plannedGiro * 100)) / 100))}</dd></div>
          </dl>
          {giroDates.length > 0 && <p className="mt-4 rounded-lg bg-emerald-100 p-3">Jatuh tempo Giro: <strong>{giroDates.length === 1 ? correctionDate(giroDates[0]) : "lihat setiap jadwal"}</strong></p>}
          <p className="mt-3 text-xs">Saldo utang mengikuti pembayaran yang tercatat, bukan hanya jadwal.</p>
        </aside>
        </div>
        <h3 className="border-t border-slate-200 pt-4 font-bold">Pembayaran tercatat</h3>
        {!editor.payment.sources.length && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Belum ada pembayaran tercatat. Jadwal pembayaran tidak membuat pelunasan otomatis.</p>}
        {editor.payment.sources.map((source, index) => {
          const belongsToPayment = (entry: { paymentId: string; sourceKind: string }) =>
            entry.paymentId === source.paymentId && entry.sourceKind === source.sourceKind;
          const correction = corrections.find(belongsToPayment);
          const sourceAllocations = allocations.filter(entry => belongsToPayment(entry) && Number(entry.amount) > 0);
          const recordedMethod = sourceAllocations.length === 1 ? sourceAllocations[0].method : "";
          return <fieldset key={`${source.sourceKind}:${source.paymentId}`} aria-invalid={paymentError?.includes("alokasi") ? true : undefined} aria-describedby={paymentError?.includes("alokasi") ? "correction-allocation-error" : undefined} className="space-y-3 rounded-xl border p-3"><legend>Pembayaran {index + 1} · {money(source.amount)} · {correctionDate(source.paidAt)}</legend>
            <label className="block text-sm font-medium">Metode pembayaran tercatat
              <select className={control} aria-label={`Metode pembayaran tercatat ${index + 1}`} value={recordedMethod} onChange={event => {
                const next = event.target.value;
                if (next !== "TRANSFER" && next !== "GIRO") return;
                setAllocations(current => [...current.filter(entry => !belongsToPayment(entry)), {
                  paymentId: source.paymentId, sourceKind: source.sourceKind, method: next, amount: correction?.amount ?? source.amount,
                }]);
                setError(null);
              }}>
                <option value="" disabled>Alokasi khusus</option>
                <option value="TRANSFER">Transfer</option>
                <option value="GIRO">Giro</option>
              </select>
            </label>
            <details className="space-y-2 text-sm" open={paymentError?.includes("alokasi") || undefined}>
              <summary className="min-h-11 cursor-pointer py-2 font-medium">Koreksi lanjutan</summary>
              <p className="text-slate-600">Bagi nominal ke Transfer dan Giro, atau koreksi nominal dan tanggal sesuai bukti pembayaran.</p>
            <div className="grid gap-3 sm:grid-cols-2">{(["TRANSFER", "GIRO"] as const).map(allocationMethod => <label key={allocationMethod}>Alokasi {allocationMethod === "GIRO" ? "Giro" : "Transfer"}<input className={control} aria-label={`Alokasi ${allocationMethod} pembayaran ${index + 1}`} type="number" min="0" step="0.01" value={allocations.find(entry => entry.paymentId === source.paymentId && entry.sourceKind === source.sourceKind && entry.method === allocationMethod)?.amount ?? "0"} onChange={e => setAllocations(current => [...current.filter(entry => !(entry.paymentId === source.paymentId && entry.sourceKind === source.sourceKind && entry.method === allocationMethod)), { paymentId: source.paymentId, sourceKind: source.sourceKind, method: allocationMethod, amount: e.target.value }])} /></label>)}</div>
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={Boolean(correction)} onChange={e => setCorrections(current => e.target.checked ? [...current, { ...source, paidAt: source.paidAt.slice(0, 10) }] : current.filter(entry => !(entry.paymentId === source.paymentId && entry.sourceKind === source.sourceKind)))} />Koreksi nominal atau tanggal pembayaran ini</label>
            {correction && <div className="grid gap-3 sm:grid-cols-2">{([ ["amount", "Nominal", "number"], ["paidAt", "Tanggal pembayaran", "date"] ] as const).map(([field, label, type]) => <label key={field}>{label}<input className={control} type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} required value={correction[field]} onChange={e => setCorrections(current => current.map(entry => entry === correction ? { ...entry, [field]: e.target.value } : entry))} /></label>)}</div>}
            </details>
          </fieldset>;
        })}
        {paymentError?.includes("alokasi") && <p id="correction-allocation-error" className="text-sm font-semibold text-rose-800">{paymentError}</p>}
        </section>
        <label className="block font-semibold">Alasan perubahan<textarea required className={control} aria-label="Alasan perubahan" value={reason} onChange={e => setReason(e.target.value)} /></label>
      </fieldset>
      <div className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-white py-3"><button type="button" className={action} onClick={onClose} disabled={busy}>Batal</button><button type="submit" className={`${action} bg-cyan-700 text-white`} disabled={busy || !reason.trim()}>{busy ? "Memeriksa…" : "Tinjau dampak"}</button></div>
    </form>}
    {stage === "catalog" && <section aria-label="Pilihan harga katalog" className="space-y-4">
      <h3 ref={stageRef} tabIndex={-1} className="text-lg font-bold">Harga beli berubah. Koreksi katalog juga?</h3><p className="text-sm">Pilih HPP dan harga jual secara terpisah. Harga yang tidak dipilih tetap seperti semula.</p>
      {changedPrices.map(item => { const entry = catalog.find(entry => entry.productId === item.productId); return <fieldset key={item.productId} className="space-y-2 rounded-xl border p-3"><legend className="font-bold">{item.productName} · {item.unit}</legend>
        {([ ["costPrice", "HPP", item.unitPrice, item.catalogCostPrice ?? "0"], ["salePrice", "harga jual", item.catalogSalePrice, item.catalogSalePrice] ] as const).map(([field, label, value, old]) => <div key={field}><label className="flex min-h-11 items-center gap-2"><input type="checkbox" aria-label={`Ubah ${label} ${item.productName}`} checked={entry?.[field] != null} onChange={e => selectCatalog(item, field, e.target.checked ? value : null)} />Ubah {label} · sebelumnya {money(old)}</label>{entry?.[field] != null && <label>Nilai {label} baru<input aria-label={`${label} baru ${item.productName}`} type="number" min="0" step="0.01" className={control} value={entry[field]} onChange={e => selectCatalog(item, field, e.target.value)} /></label>}</div>)}
      </fieldset>; })}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className={action} onClick={() => setStage("edit")}>Kembali</button><button type="button" className={`${action} bg-cyan-700 text-white`} disabled={busy} onClick={() => { void loadPreview(); }}>Lanjutkan tinjau dampak</button></div>
    </section>}
    {stage === "review" && review && <section aria-label="Tinjau dampak perubahan" className="space-y-4">
      <h3 ref={stageRef} tabIndex={-1} className="text-lg font-bold">Tinjau dampak sebelum simpan</h3><CorrectionImpact preview={review.preview} productName={productName} />
      <p className="text-sm">Alasan: {reason}</p>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white py-3"><p className="text-xs text-slate-600">Koreksi dicatat dalam riwayat.</p><div className="flex flex-wrap gap-2"><button type="button" className={action} disabled={busy} onClick={() => { setStage("edit"); setError(null); setReview(null); setIdempotencyKey(crypto.randomUUID()); }}>Kembali mengedit</button><button type="button" className={`${action} bg-cyan-700 text-white`} disabled={busy} onClick={save}>{busy ? "Menyimpan…" : "Simpan perubahan"}</button></div></div>
    </section>}
  </div>;
}

export function CorrectionImpact({ preview, productName = () => "Barang" }: { preview: CorrectionPreview; productName?: (id: string) => string }) {
  const schedule = preview.changes.find(change => change.field === "pembayaran.jadwal");
  const difference = Number(preview.newTotal) - Number(preview.oldTotal);
  const changes = schedule ? preview.changes.filter(change => !["pembayaran.metode", "pembayaran.jatuhTempo"].includes(change.field)) : preview.changes;
  const groups = [
    { title: "Data daftar", entries: changes.filter(change => change.field.startsWith("daftar.")) },
    { title: "Barang dan penerimaan", entries: changes.filter(change => change.field.startsWith("barang.")) },
    { title: "Jadwal dan pembayaran", entries: changes.filter(change => change.field.startsWith("pembayaran.")) },
    { title: "Harga katalog", entries: changes.filter(change => change.field.startsWith("katalog.")) },
    { title: "Perubahan lainnya", entries: changes.filter(change => !/^(daftar|barang|pembayaran|katalog)\./.test(change.field)) },
  ];
  return <div className="space-y-3 text-sm">
    <dl className="grid overflow-hidden rounded-xl border border-slate-200 sm:grid-cols-3">
      <div className="p-4"><dt className="text-slate-600">Total sebelumnya</dt><dd className="mt-1 text-lg font-bold tabular-nums">{correctionMoney(preview.oldTotal)}</dd></div>
      <div className="border-y border-slate-200 bg-cyan-50 p-4 sm:border-x sm:border-y-0"><dt className="text-cyan-900">Total setelah koreksi</dt><dd className="mt-1 text-xl font-bold tabular-nums text-cyan-900">{correctionMoney(preview.newTotal)}</dd><p className="mt-1 text-xs text-cyan-900">{difference === 0 ? "Total tidak berubah" : `${difference < 0 ? "Berkurang" : "Bertambah"} ${correctionMoney(Math.abs(difference))}`}</p></div>
      <div className="p-4"><dt className="text-slate-600">Pembayaran tercatat</dt><dd className="mt-1 text-lg font-bold tabular-nums">{correctionMoney(preview.paid)}</dd><p className="mt-1 text-xs text-slate-600">Terpisah dari rencana pembayaran</p></div>
    </dl>
    {Number(preview.paid) === 0 && <p className="rounded-lg bg-slate-50 p-3 text-slate-600">Belum ada pembayaran tercatat setelah koreksi. Jadwal pembayaran tetap merupakan rencana.</p>}
    {Number(preview.overpaid) > 0 && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 font-semibold text-amber-950">Kelebihan pembayaran {money(preview.overpaid)}. Belum ada pengembalian uang yang dicatat.</p>}
    <p>Tanggal laporan terdampak: {preview.affectedDates.map(correctionDate).join(" · ") || "Tidak ada"}</p>
    <ul className="space-y-1">{preview.stock.map((stock, i) => <li key={`${stock.productId}-${i}`}>Stok {productName(stock.productId)}: {stock.baseDelta > 0 ? "+" : ""}{stock.baseDelta} {stock.unit}</li>)}</ul>
    {groups.filter(group => group.entries.length).map(group => <section key={group.title} className="space-y-3 border-t border-slate-200 pt-4" aria-label={group.title}>
      <h3 className="font-bold text-slate-900">{group.title}</h3>
      {group.entries.map((change, index) => <div key={index} className="min-w-0 space-y-2 break-words">
        <h4 className="font-semibold">{correctionFieldLabel(change.field)}</h4>
        {["pembayaran.jadwal", "pembayaran.alokasi", "pembayaran.rincian"].includes(change.field)
          ? <CorrectionPaymentComparison change={change} />
          : <dl className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-2">{([ ["Sebelum", change.before], ["Sesudah", change.after] ] as const).map(([label, value]) => <div key={label}><dt className="text-xs text-slate-600">{label}</dt><dd className="mt-1">{change.field === "pembayaran.metode" ? correctionMethodLabel(value) : change.field === "pembayaran.jatuhTempo" ? typeof value === "string" ? correctionDate(value) : "Tidak berlaku" : describeChange(value, productName)}</dd></div>)}</dl>}
      </div>)}
      {group.title === "Jadwal dan pembayaran" && <p className="rounded-lg border-l-4 border-slate-300 bg-slate-50 p-3 text-xs text-slate-600">Jadwal adalah rencana pembayaran. Tanggal Giro tetap dicatat per baris; perubahan jadwal tidak mencatat pelunasan atau pengembalian uang otomatis.</p>}
    </section>)}
  </div>;
}
function correctionFieldLabel(field: string): string {
  const labels: Record<string, string> = {
    header: "Data daftar", items: "Barang dan penerimaan", payment: "Pembayaran", catalog: "Harga katalog",
    name: "Nama daftar", number: "Nomor daftar", businessDate: "Tanggal usaha", supplierId: "Pemasok",
    requestedByName: "Pemohon", note: "Catatan", unit: "Satuan", requestedQty: "Jumlah kebutuhan",
    approvedQty: "Jumlah disetujui", orderedQty: "Jumlah dipesan", unitPrice: "Harga beli",
    receipts: "Penerimaan", receivedQty: "Jumlah diterima", stock: "Stok", total: "Total",
    HPP: "HPP", hargaJual: "Harga jual", metode: "Metode pembayaran", jatuhTempo: "Jatuh tempo",
    alokasi: "Alokasi pembayaran", rincian: "Rincian pembayaran", jadwal: "Jadwal pembayaran", productName: "Nama barang", sku: "SKU",
    method: "Metode", amount: "Nominal", dueDate: "Jatuh tempo", paidAt: "Tanggal pembayaran", sourceKind: "Sumber pembayaran",
  };
  if (labels[field]) return labels[field];
  const parts = field.split(".");
  if (parts[0] === "barang" && parts[1] === "baru") return "Barang baru";
  if (parts[0] === "daftar" || parts[0] === "pembayaran") return labels[parts.slice(1).join(".")] ?? "Rincian perubahan";
  if ((parts[0] === "barang" || parts[0] === "katalog") && parts.length >= 3) {
    const detail = parts[parts.length - 1];
    return `${parts.slice(1, -1).join(".")} · ${labels[detail] ?? "Rincian perubahan"}`;
  }
  if (parts[0] === "barang" && parts.length === 2) return `${parts[1]} · Barang dihapus`;
  return "Rincian perubahan";
}
function describeChange(value: unknown, productName: (id: string) => string): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return value.map(entry => describeChange(entry, productName)).join("; ") || "Tidak ada";
  if (typeof value === "object") return Object.entries(value).filter(([key]) => !["clientLineKey", "requestItemId", "purchaseItemId", "receiptLineId", "paymentId", "expectedUpdatedAt"].includes(key)).map(([key, entry]) => `${key === "productId" ? "Barang" : correctionFieldLabel(key)}: ${key === "productId" && typeof entry === "string" ? productName(entry) : describeChange(entry, productName)}`).join(", ");
  return String(value);
}
