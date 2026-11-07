"use client";

import React, { useRef, useState } from "react";
import { Modal } from "@pos/ui";
import type { Product } from "@/hooks/useProducts";
import { SupplierSelector } from "@/features/suppliers/components/SupplierSelector";
import { InboundPaymentFields } from "@/features/inventory-management/components/InboundPaymentFields";
import type { InboundPaymentInput } from "@/features/inventory-management/types/inventory-management";
import { ProductAutocomplete } from "./ProductAutocomplete";
import { useCorrectionEditor, usePreviewCorrection, useSaveCorrection } from "../hooks/useShoppingRequestCorrection";
import type { ShoppingRequestCorrectionEditor } from "../repositories/shopping-request-correction-editor";
import type { CorrectionPreview, ShoppingRequestCorrectionInput } from "../types/shopping-request-correction";

const control = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600";
const action = "min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-600 disabled:opacity-50";
const money = (value: string) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR" }).format(Number(value));
type EditorItem = ShoppingRequestCorrectionEditor["items"][number];

export function CorrectionDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const container = useRef<HTMLDivElement>(null);
  return <Modal open onClose={onClose} title={title} size="4xl"><div ref={container} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const elements = Array.from(container.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? []).filter(element => element.getClientRects().length > 0);
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>{children}</div></Modal>;
}

export function ShoppingRequestCorrectionModal({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const editor = useCorrectionEditor(requestId);
  return <CorrectionDialog title="Edit daftar belanja" onClose={onClose}>
    {editor.isPending && <p role="status">Memuat data terbaru…</p>}
    {editor.isError && <div role="alert"><p>{editor.error.message}</p><button type="button" className={action} onClick={() => editor.refetch()}>Muat ulang</button></div>}
    {editor.data && <ShoppingRequestCorrectionForm key={requestId} editor={editor.data} onClose={onClose} />}
  </CorrectionDialog>;
}

export function ShoppingRequestCorrectionForm({ editor, onClose }: { editor: ShoppingRequestCorrectionEditor; onClose: () => void }) {
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
  const [adding, setAdding] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const previewMutation = usePreviewCorrection(editor.requestId);
  const saveMutation = useSaveCorrection(editor.requestId);
  const busy = adding || previewMutation.isPending || saveMutation.isPending;
  const hasReceipts = editor.items.some(item => item.receipts.length) || items.some(item => item.receipts.some(receipt => receipt.receivedQty > 0));
  const scheduledTotal = items.reduce((sum, item) => sum + Math.round(Number(item.unitPrice) * (hasReceipts ? item.receipts.reduce((qty, receipt) => qty + receipt.receivedQty, 0) : item.orderedQty) * 100), 0) / 100;
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
    setError(null);
    const input: ShoppingRequestCorrectionInput = {
      idempotencyKey, expectedVersion: editor.version, reason: reason.trim(),
      header: { ...header, name: header.name?.trim() ?? "", number: header.number?.trim() ?? "" },
      items: items.map(({ clientLineKey, requestItemId, purchaseItemId, productId, unit, requestedQty, approvedQty, orderedQty, unitPrice, receipts }) => ({ clientLineKey, requestItemId, purchaseItemId, productId, unit, requestedQty, approvedQty, orderedQty, unitPrice, receipts })),
      payment: { method, dueDate: dueDate || null, ...(schedule ? { schedule: schedule.map(row => ({ ...row, amount: row.amount.toFixed(2), dueDate: row.dueDate ?? null, note: row.note ?? null })) } : {}), allocations: allocations.filter(entry => Number(entry.amount) > 0), corrections },
      catalog: catalog.filter(entry => items.some(item => item.productId === entry.productId) && (entry.costPrice !== null || entry.salePrice !== null)),
    };
    try { const preview = await previewMutation.mutateAsync(input); setReview({ preview, input: { ...input, expectedPreviewVersion: preview.version } }); setStage("review"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Dampak perubahan belum dapat ditinjau."); setStage("edit"); }
  };
  const save = async () => {
    if (!review || busy) return;
    setError(null);
    try { await saveMutation.mutateAsync(review.input); onClose(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Perubahan belum dapat disimpan."); }
  };
  const selectCatalog = (item: EditorItem, field: "costPrice" | "salePrice", value: string | null) => setCatalog(current => {
    const entry = current.find(entry => entry.productId === item.productId) ?? { productId: item.productId, costPrice: null, salePrice: null, expectedUpdatedAt: item.catalogUpdatedAt };
    return [...current.filter(entry => entry.productId !== item.productId), { ...entry, [field]: value }];
  });
  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {stage === "edit" && <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (changedPrices.length) setStage("catalog"); else void loadPreview(); }}>
      <p className="rounded-lg bg-cyan-50 p-3 text-sm text-cyan-950">Total pembelian berdasarkan jumlah yang benar-benar diterima. Mengubah kebutuhan atau pesanan saja tidak menambah stok.</p>
      {editor.pendingReceipts.length > 0 && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">Ada penerimaan yang menunggu persetujuan. Selesaikan penerimaan tersebut sebelum mengoreksi barang terkait.</p>}
      <fieldset disabled={busy} className="space-y-4">
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
        <h3 className="font-bold">Pembayaran yang tercatat</h3>
        <p className="text-sm text-slate-600">Perubahan ini membetulkan catatan. Tidak ada pemindahan uang atau pengembalian uang otomatis.</p>
        {!schedule && <div className="grid gap-3 sm:grid-cols-2"><label>Metode pembayaran<select className={control} aria-label="Metode pembayaran" value={method ?? ""} onChange={e => setMethod(e.target.value as typeof method || null)}><option value="">Belum ditentukan</option><option value="TRANSFER">Transfer</option><option value="GIRO">Giro</option></select></label><label>Jatuh tempo<input type="date" className={control} aria-label="Jatuh tempo" value={dueDate} onChange={e => setDueDate(e.target.value)} /></label></div>}
        {schedule ? <InboundPaymentFields payments={schedule} totalAmount={scheduledTotal} allowZeroAmounts onChange={setSchedule} /> : <button type="button" className={action} onClick={() => setSchedule([{ method: method ?? "TRANSFER", amount: scheduledTotal, dueDate: method === "GIRO" ? dueDate || null : null, note: null }])}>Atur rincian Transfer dan Giro</button>}
        <p className="text-sm text-slate-600">Rincian jadwal adalah rencana pembayaran. Pembayaran yang sudah terjadi tetap dicatat terpisah di bawah.</p>
        {editor.payment.sources.map((source, index) => {
          const correction = corrections.find(entry => entry.paymentId === source.paymentId && entry.sourceKind === source.sourceKind);
          return <fieldset key={`${source.sourceKind}:${source.paymentId}`} className="space-y-3 rounded-xl border p-3"><legend>Pembayaran {index + 1} · {money(source.amount)} · {source.paidAt.slice(0, 10)}</legend>
            <p className="text-sm">Tentukan alokasi pembayaran lama ke Transfer/Giro. Satu pembayaran tidak boleh dihitung dua kali.</p>
            <div className="grid gap-3 sm:grid-cols-2">{(["TRANSFER", "GIRO"] as const).map(allocationMethod => <label key={allocationMethod}>Alokasi {allocationMethod === "GIRO" ? "Giro" : "Transfer"}<input className={control} aria-label={`Alokasi ${allocationMethod} pembayaran ${index + 1}`} type="number" min="0" step="0.01" value={allocations.find(entry => entry.paymentId === source.paymentId && entry.sourceKind === source.sourceKind && entry.method === allocationMethod)?.amount ?? "0"} onChange={e => setAllocations(current => [...current.filter(entry => !(entry.paymentId === source.paymentId && entry.sourceKind === source.sourceKind && entry.method === allocationMethod)), { paymentId: source.paymentId, sourceKind: source.sourceKind, method: allocationMethod, amount: e.target.value }])} /></label>)}</div>
            <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={Boolean(correction)} onChange={e => setCorrections(current => e.target.checked ? [...current, { ...source, paidAt: source.paidAt.slice(0, 10) }] : current.filter(entry => !(entry.paymentId === source.paymentId && entry.sourceKind === source.sourceKind)))} />Koreksi nominal atau tanggal pembayaran ini</label>
            {correction && <div className="grid gap-3 sm:grid-cols-2">{([ ["amount", "Nominal", "number"], ["paidAt", "Tanggal pembayaran", "date"] ] as const).map(([field, label, type]) => <label key={field}>{label}<input className={control} type={type} min={type === "number" ? "0" : undefined} step={type === "number" ? "0.01" : undefined} required value={correction[field]} onChange={e => setCorrections(current => current.map(entry => entry === correction ? { ...entry, [field]: e.target.value } : entry))} /></label>)}</div>}
          </fieldset>;
        })}
        <label className="block font-semibold">Alasan perubahan<textarea required className={control} aria-label="Alasan perubahan" value={reason} onChange={e => setReason(e.target.value)} /></label>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className={action} onClick={onClose} disabled={busy}>Batal</button><button type="submit" className={`${action} bg-cyan-700 text-white`} disabled={busy || !reason.trim()}>{busy ? "Memeriksa…" : "Tinjau dampak"}</button></div>
    </form>}
    {stage === "catalog" && <section aria-label="Pilihan harga katalog" className="space-y-4">
      <h3 tabIndex={-1} className="text-lg font-bold">Harga beli berubah. Koreksi katalog juga?</h3><p className="text-sm">Pilih HPP dan harga jual secara terpisah. Harga yang tidak dipilih tetap seperti semula.</p>
      {changedPrices.map(item => { const entry = catalog.find(entry => entry.productId === item.productId); return <fieldset key={item.productId} className="space-y-2 rounded-xl border p-3"><legend className="font-bold">{item.productName} · {item.unit}</legend>
        {([ ["costPrice", "HPP", item.unitPrice, item.catalogCostPrice ?? "0"], ["salePrice", "harga jual", item.catalogSalePrice, item.catalogSalePrice] ] as const).map(([field, label, value, old]) => <div key={field}><label className="flex min-h-11 items-center gap-2"><input type="checkbox" aria-label={`Ubah ${label} ${item.productName}`} checked={entry?.[field] != null} onChange={e => selectCatalog(item, field, e.target.checked ? value : null)} />Ubah {label} · sebelumnya {money(old)}</label>{entry?.[field] != null && <label>Nilai {label} baru<input aria-label={`${label} baru ${item.productName}`} type="number" min="0" step="0.01" className={control} value={entry[field]} onChange={e => selectCatalog(item, field, e.target.value)} /></label>}</div>)}
      </fieldset>; })}
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className={action} onClick={() => setStage("edit")}>Kembali</button><button type="button" className={`${action} bg-cyan-700 text-white`} disabled={busy} onClick={() => { void loadPreview(); }}>Lanjutkan tinjau dampak</button></div>
    </section>}
    {stage === "review" && review && <section aria-label="Tinjau dampak perubahan" className="space-y-4">
      <h3 className="text-lg font-bold">Tinjau dampak sebelum simpan</h3><CorrectionImpact preview={review.preview} productName={productName} />
      <p className="text-sm">Alasan: {reason}</p>
      <div className="flex flex-wrap justify-end gap-2"><button type="button" className={action} disabled={busy} onClick={() => { setStage("edit"); setReview(null); setIdempotencyKey(crypto.randomUUID()); }}>Kembali mengedit</button><button type="button" className={`${action} bg-cyan-700 text-white`} disabled={busy} onClick={save}>{busy ? "Menyimpan…" : "Simpan perubahan"}</button></div>
    </section>}
  </div>;
}

export function CorrectionImpact({ preview, productName = () => "Barang" }: { preview: CorrectionPreview; productName?: (id: string) => string }) {
  return <div className="space-y-3 text-sm">
    <p>Total berdasarkan barang diterima: <strong>{money(preview.oldTotal)} → {money(preview.newTotal)}</strong></p>
    <p>Pembayaran tercatat: {money(preview.paid)}</p>
    {Number(preview.overpaid) > 0 && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 font-semibold text-amber-950">Kelebihan pembayaran {money(preview.overpaid)}. Belum ada pengembalian uang yang dicatat.</p>}
    <p>Tanggal laporan terdampak: {preview.affectedDates.join(", ") || "Tidak ada"}</p>
    <ul className="space-y-1">{preview.stock.map((stock, i) => <li key={`${stock.productId}-${i}`}>Stok {productName(stock.productId)}: {stock.baseDelta > 0 ? "+" : ""}{stock.baseDelta} {stock.unit}</li>)}</ul>
    <div className="space-y-2">{preview.changes.map((change, i) => <div key={i} className="break-words rounded-lg border p-2"><p className="font-semibold">{correctionFieldLabel(change.field)}</p><p>Sebelum: {describeChange(change.before, productName)}</p><p>Sesudah: {describeChange(change.after, productName)}</p></div>)}</div>
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
