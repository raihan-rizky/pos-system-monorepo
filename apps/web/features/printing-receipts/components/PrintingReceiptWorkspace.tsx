"use client";

import { useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Input, Modal } from "@pos/ui";
import { AlertCircle, Check, ChevronLeft, ChevronRight, CreditCard, FilePlus2, Link2, List, Plus, Printer, RotateCcw, Search, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { PaymentModal } from "@/components/PaymentModal";
import { useRole } from "@/components/providers/RoleProvider";
import { useDebounce } from "@/hooks/useDebounce";
import type { Transaction } from "@/hooks/useTransactions";
import type { CheckoutCustomerSelection } from "@/features/pos-checkout/customer-selection";
import { invalidateTransactionViews } from "@/features/transaction-history/helpers/invalidate";
import { formatRupiah } from "@/lib/utils";
import { buildPrintingReceiptCartItems } from "../checkout";
import { getPrintingReceiptLayout, getPrintingReceiptTotals } from "../layout";
import { getPrintingReceiptScopeKey, getPrintingReceiptWritePermissions } from "../permissions";
import { usePrintingReceiptAutosave } from "../hooks/usePrintingReceiptAutosave";
import { getPrintingReceiptPreviewRecord, readPrintingReceiptResponse } from "../receipt-api";
import { PRINTING_SUBCATEGORIES, type PrintingReceipt, type PrintingReceiptLine, type PrintingSubcategory } from "../types";
import { PrintingReceiptModal } from "./PrintingReceiptModal";
import { PrintingReceiptStockLinkModal } from "./PrintingReceiptStockLinkModal";
import { PrintingReceiptView } from "./PrintingReceiptView";

interface ReceiptList { data: PrintingReceipt[]; pagination: { page: number; total: number; totalPages: number; hasNextPage?: boolean } }
type PaymentInput = Parameters<ComponentProps<typeof PaymentModal>["onConfirm"]>[0];
const makeBlankLine = (): PrintingReceiptLine => ({ id: crypto.randomUUID(), name: "", material: "", quantity: null, price: null, stockLink: null });

export interface PrintingReceiptWorkspaceProps {
  canCheckout?: boolean;
  onRequireShift?: () => void;
}

export function PrintingReceiptWorkspace(props: PrintingReceiptWorkspaceProps) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  const scopeKey = getPrintingReceiptScopeKey({ userId, storeId, authorizationFingerprint });
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  return <PrintingReceiptSession key={scopeKey} {...props} isCurrentScope={() => currentScope.current === scopeKey} />;
}

function PrintingReceiptSession({ canCheckout = true, onRequireShift, isCurrentScope }: PrintingReceiptWorkspaceProps & { isCurrentScope: () => boolean }) {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const isCurrentSession = () => mounted.current && isCurrentScope();
  const { role, userId, storeId, authorizationFingerprint, canPerform } = useRole();
  const { canCreate, canUpdate, canDelete } = getPrintingReceiptWritePermissions(role, canPerform);
  const [subcategory, setSubcategory] = useState<PrintingSubcategory>("SPANDUK");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search.trim(), 300);
  const [page, setPage] = useState(1);
  const [listOpen, setListOpen] = useState(false);
  const [listCollapsed, setListCollapsed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"delete" | "reload" | null>(null);
  const [stockLineId, setStockLineId] = useState<string | null>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<PrintingReceipt | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<PrintingReceipt | null>(null);
  const selectedBySubcategory = useRef<Partial<Record<PrintingSubcategory, string>>>({});
  const checkoutPending = useRef(false);
  const queryClient = useQueryClient();
  const editor = usePrintingReceiptAutosave(() => { void queryClient.invalidateQueries({ queryKey: ["printing-receipts"] }); }, isCurrentScope);
  const receipt = editor.receipt;
  const editable = Boolean(receipt && !receipt.transactionId && canUpdate && !busy && !paymentReceipt);
  const list = useQuery({
    queryKey: ["printing-receipts", userId, storeId, authorizationFingerprint, { subcategory, search: debouncedSearch, page }],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ subcategory, search: debouncedSearch, page: String(page), limit: "12" });
      const response = await fetch(`/api/printing-receipts?${params}`, { signal });
      if (!response.ok) { await readPrintingReceiptResponse(response); throw new Error("Daftar nota belum dapat dimuat."); }
      return response.json() as Promise<ReceiptList>;
    },
  });
  const totals = receipt ? getPrintingReceiptTotals(receipt) : null;
  const stockLine = receipt?.document.lines.find(line => line.id === stockLineId);
  const paymentItems = useMemo(() => paymentReceipt ? buildPrintingReceiptCartItems(paymentReceipt.document.lines) : [], [paymentReceipt]);
  const initialCustomer = useMemo<CheckoutCustomerSelection>(() => {
    if (!paymentReceipt) return { kind: "general" };
    const document = paymentReceipt.document;
    if (document.customerId) return { kind: "existing", customer: { id: document.customerId, name: document.customerName } };
    if (document.customerName.trim() && document.customerName !== "Pelanggan Umum") return { kind: "new", name: document.customerName, phone: document.customerPhone || undefined };
    return { kind: "general" };
  }, [paymentReceipt]);

  const loadRecord = (record: PrintingReceipt) => {
    if (!isCurrentSession()) return;
    setConfirmAction(null); setStockLineId(null); setError(null);
    editor.load(record);
    selectedBySubcategory.current[record.subcategory] = record.id;
    if (!record.transactionId && canUpdate && record.document.lines.length === 0) {
      editor.update({ ...record, document: { ...record.document, lines: Array.from({ length: getPrintingReceiptLayout(record.subcategory).rowsPerPage }, makeBlankLine) } });
    }
  };
  const fetchRecord = async (id: string) => readPrintingReceiptResponse<PrintingReceipt>(await fetch(`/api/printing-receipts/${encodeURIComponent(id)}`, { cache: "no-store" }));
  const run = async (action: () => Promise<void>) => {
    if (!isCurrentSession() || busy || checkoutPending.current) return;
    setBusy(true); setError(null);
    try { await action(); }
    catch (failure) { if (isCurrentSession()) setError(failure instanceof Error ? failure.message : "Aksi belum berhasil. Coba lagi."); }
    finally { if (isCurrentSession()) setBusy(false); }
  };
  const selectRecord = (id: string) => run(async () => {
    await editor.flush();
    if (!isCurrentSession()) return;
    loadRecord(await fetchRecord(id));
    if (isCurrentSession()) setListOpen(false);
  });
  const selectSubcategory = (next: PrintingSubcategory) => run(async () => {
    if (next === subcategory) return;
    await editor.flush();
    if (!isCurrentSession()) return;
    editor.load(null); setSubcategory(next); setSearch(""); setPage(1); setStockLineId(null);
    const remembered = selectedBySubcategory.current[next];
    if (remembered) loadRecord(await fetchRecord(remembered));
  });
  const createRecord = () => run(async () => {
    await editor.flush();
    if (!isCurrentSession()) return;
    const response = await fetch("/api/printing-receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subcategory }) });
    const created = await readPrintingReceiptResponse<PrintingReceipt>(response);
    if (!isCurrentSession()) return;
    loadRecord(created);
    setPage(1); setSearch(""); setListOpen(false);
    await queryClient.invalidateQueries({ queryKey: ["printing-receipts"] });
  });
  const preview = () => run(async () => {
    const saved = await editor.flush();
    if (!saved || !isCurrentSession()) return;
    const current = await getPrintingReceiptPreviewRecord(saved);
    if (!isCurrentSession()) return;
    if (current.transactionId) loadRecord(current);
    setPreviewReceipt(current);
  });
  const openPayment = () => run(async () => {
    if (!canCheckout) { onRequireShift?.(); throw new Error("Buka shift kasir terlebih dahulu sebelum pembayaran."); }
    const saved = await editor.flush();
    if (!saved || saved.transactionId || !isCurrentSession()) return;
    buildPrintingReceiptCartItems(saved.document.lines);
    setPaymentReceipt(saved);
  });
  const checkout = async (data: PaymentInput) => {
    if (!isCurrentSession() || checkoutPending.current) return;
    checkoutPending.current = true; setBusy(true); setError(null);
    try {
      let saved = await editor.flush();
      if (!isCurrentSession()) return;
      if (!saved) throw new Error("Nota aktif tidak ditemukan. Buka kembali nota sebelum pembayaran.");
      if (saved.document.customerName !== data.customerName || saved.document.customerId !== data.customerId) {
        editor.update({ ...saved, document: { ...saved.document, customerName: data.customerName, customerId: data.customerId } });
        saved = await editor.flush();
      }
      if (!isCurrentSession()) return;
      if (!saved) throw new Error("Nota belum tersimpan. Coba lagi.");
      const response = await fetch("/api/transactions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, note: data.note || saved.document.note, items: buildPrintingReceiptCartItems(saved.document.lines), printingReceiptId: saved.id, printingReceiptRevision: saved.revision }),
      });
      const transaction = await readPrintingReceiptResponse<Transaction>(response);
      if (!isCurrentSession()) return;
      const processed = { ...saved, transactionId: transaction.id, transaction };
      editor.load(processed); setPaymentReceipt(null); setPreviewReceipt(processed);
      void queryClient.invalidateQueries({ queryKey: ["printing-receipts"] });
      invalidateTransactionViews(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["active-shift"] });
    } catch (failure) { if (isCurrentSession()) setError(failure instanceof Error ? failure.message : "Pembayaran belum berhasil. Coba lagi; nota yang sama tidak membuat transaksi ganda."); }
    finally { checkoutPending.current = false; if (isCurrentSession()) setBusy(false); }
  };
  const confirm = () => run(async () => {
    if (!receipt) return;
    if (confirmAction === "reload") loadRecord(await fetchRecord(receipt.id));
    else {
      const saved = await editor.flush();
      if (!saved || !isCurrentSession()) return;
      await readPrintingReceiptResponse(await fetch(`/api/printing-receipts/${encodeURIComponent(saved.id)}?revision=${saved.revision}`, { method: "DELETE" }));
      if (!isCurrentSession()) return;
      delete selectedBySubcategory.current[subcategory]; editor.load(null);
      void queryClient.invalidateQueries({ queryKey: ["printing-receipts"] });
    }
    setConfirmAction(null);
  });

  return <div className="printing-receipt-workspace">
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-surface-200 bg-white px-3 py-2" role="tablist" aria-label="Jenis nota percetakan">
      {PRINTING_SUBCATEGORIES.map(category => <button type="button" role="tab" aria-selected={subcategory === category} aria-controls="printing-receipt-panel" key={category} disabled={busy}
        onClick={() => void selectSubcategory(category)} className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${subcategory === category ? "bg-brand-600 text-white" : "text-surface-600 hover:bg-surface-100"}`}>{category}</button>)}
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-surface-200 bg-white px-3 py-2">
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" className="md:hidden" aria-expanded={listOpen} aria-controls="printing-receipt-list" onClick={() => { setListCollapsed(false); setListOpen(value => !value); }}><List size={16} />Daftar nota</Button>
        <Button size="sm" disabled={!canCreate || busy} onClick={() => void createRecord()}><FilePlus2 size={16} />Buat Nota Kosong</Button>
      </div>
      <div className="flex items-center gap-2">
        {receipt && <span role="status" aria-live="polite" className={`flex items-center gap-1 text-xs ${editor.status === "error" ? "text-danger-700" : "text-surface-500"}`}>
          {editor.status === "saved" && <Check size={13} />}{editor.status === "error" && <AlertCircle size={13} />}
          {editor.status === "saved" ? "Tersimpan" : editor.status === "error" ? "Gagal menyimpan" : "Menyimpan..."}
        </span>}
        {receipt && <Button variant="secondary" size="sm" disabled={busy} onClick={() => void preview()}><Printer size={15} />Cetak / PDF</Button>}
        {receipt && !receipt.transactionId && <Button size="sm" disabled={!canCreate || busy} onClick={() => void openPayment()}><CreditCard size={15} />Bayar / DP</Button>}
      </div>
    </div>
    {(error || editor.error) && <div role="alert" className="shrink-0 border-b border-danger-200 bg-danger-50 px-3 py-2 text-sm text-danger-700">
      <p>{error || editor.error}</p>
      {editor.status === "error" && <div className="mt-2 flex flex-wrap gap-3">
        <button type="button" className="font-semibold underline" disabled={busy} onClick={() => void run(async () => { await editor.flush(); })}>Coba simpan lagi</button>
        <button type="button" className="font-semibold underline" disabled={busy} onClick={() => setConfirmAction("reload")}>Muat ulang versi tersimpan</button>
      </div>}
    </div>}
    <div className="printing-receipt-body" data-list-collapsed={listCollapsed} id="printing-receipt-panel" role="tabpanel" aria-label={`Nota ${subcategory}`}>
      <aside className="printing-receipt-list" id="printing-receipt-list" data-open={listOpen} data-collapsed={listCollapsed} aria-label={`Daftar nota ${subcategory}`}>
        <div className="mb-1.5 flex items-center justify-end gap-1">
          {!listCollapsed && <label htmlFor="printing-receipt-search" className="mr-auto text-sm font-medium text-surface-700">Cari nota {subcategory}</label>}
          <button type="button" aria-label={listCollapsed ? "Buka daftar nota" : "Ciutkan daftar nota"}
            title={listCollapsed ? "Buka daftar nota" : "Ciutkan daftar nota"}
            aria-expanded={!listCollapsed} aria-controls="printing-receipt-list-content"
            onClick={() => { setListCollapsed(value => !value); setListOpen(false); }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-surface-500 hover:bg-surface-100 hover:text-surface-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
            {listCollapsed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronLeft size={14} aria-hidden="true" />}
          </button>
        </div>
        <div id="printing-receipt-list-content" hidden={listCollapsed}>
        <Input id="printing-receipt-search" aria-label={`Cari nota ${subcategory}`} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} icon={<Search size={15} />} placeholder="Judul, nomor, atau pelanggan" />
        <div className="mt-3 space-y-2">
          {list.isLoading && <p role="status" className="py-5 text-center text-sm text-surface-500">Memuat nota...</p>}
          {list.isError && <div role="alert" className="text-sm text-danger-700">Daftar nota belum dapat dimuat. <button className="underline" onClick={() => void list.refetch()}>Coba lagi</button></div>}
          {!list.isLoading && !list.isError && !list.data?.data.length && <p className="py-5 text-center text-sm text-surface-500">{search ? "Nota tidak ditemukan." : `Belum ada nota ${subcategory}. Buat nota kosong untuk mulai.`}</p>}
          {list.data?.data.map(record => <button type="button" disabled={busy} key={record.id} onClick={() => void selectRecord(record.id)} aria-pressed={receipt?.id === record.id}
            className={`w-full rounded-lg border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${receipt?.id === record.id ? "border-brand-300 bg-brand-50" : "border-surface-200 bg-white hover:bg-surface-50"}`}>
            <span className="block break-words text-sm font-bold text-surface-900">{record.document.title || record.number}</span>
            {record.document.title && record.document.title !== record.number && <span className="mt-1 block break-all text-xs text-surface-500">{record.number}</span>}
            <span className="mt-1 block truncate text-xs text-surface-600">{record.document.customerName || "Pelanggan belum diisi"}</span>
            <span className="mt-2 flex justify-between gap-2 text-[11px] text-surface-500"><span className={record.transactionId ? "font-semibold text-emerald-700" : "font-semibold text-amber-700"}>{record.transactionId ? "Diproses" : "Draft"}</span><time dateTime={record.updatedAt}>{new Date(record.updatedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</time></span>
          </button>)}
        </div>
        {list.data && list.data.pagination.totalPages > 1 && <div className="mt-4 flex items-center justify-between gap-2 text-xs text-surface-600">
          <Button variant="ghost" size="sm" aria-label="Halaman nota sebelumnya" disabled={page <= 1 || list.isFetching} onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} /></Button>
          <span>{page} / {list.data.pagination.totalPages}</span>
          <Button variant="ghost" size="sm" aria-label="Halaman nota berikutnya" disabled={page >= list.data.pagination.totalPages || list.isFetching} onClick={() => setPage(value => value + 1)}><ChevronRight size={16} /></Button>
        </div>}
        </div>
      </aside>
      <main className="printing-receipt-editor">
        {receipt ? <>
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-surface-200 bg-white px-3 py-2 text-xs">
            <div className="min-w-0"><strong className="break-all text-surface-800">{receipt.number}</strong><span className="ml-2 text-surface-500">{receipt.transactionId ? "Diproses · isi nota terkunci" : "Isi langsung pada lembar nota"}</span></div>
            <div className="flex items-center gap-2">
              {totals && <strong className="mr-2 text-surface-800">{formatRupiah(totals.total)}</strong>}
              <button type="button" className="rounded p-1 hover:bg-surface-100 focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Perkecil nota" onClick={() => setZoom(value => Math.max(0.5, Math.round((value - 0.1) * 10) / 10))}><ZoomOut size={16} /></button>
              <span className="w-9 text-center">{Math.round(zoom * 100)}%</span>
              <button type="button" className="rounded p-1 hover:bg-surface-100 focus-visible:ring-2 focus-visible:ring-brand-500" aria-label="Perbesar nota" onClick={() => setZoom(value => Math.min(1.8, Math.round((value + 0.1) * 10) / 10))}><ZoomIn size={16} /></button>
              {!receipt.transactionId && canDelete && <Button variant="ghost" size="sm" className="text-danger-600" disabled={busy || Boolean(paymentReceipt)} onClick={() => setConfirmAction("delete")}><Trash2 size={14} />Hapus draft</Button>}
            </div>
          </div>
          <div className="shrink-0 border-b border-surface-200 bg-white px-3 py-2">
            <Input label="Judul nota" value={receipt.document.title ?? receipt.number} maxLength={100} readOnly={!editable}
              onChange={event => editor.update({ ...receipt, document: { ...receipt.document, title: event.target.value } })}
              hint="Penanda internal untuk membedakan nota. Tidak tampil pada cetakan atau PDF." />
          </div>
          <div className="printing-receipt-viewport flex-1" tabIndex={0} role="region" aria-label="Lembar nota, geser untuk melihat seluruh halaman">
            <PrintingReceiptView receipt={receipt} editable={editable} onChange={editor.update} zoom={zoom} />
          </div>
          {editable && <details className="max-h-56 shrink-0 overflow-y-auto border-t border-surface-200 bg-white px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-surface-700">Baris dan hubungan stok ({receipt.document.lines.length})</summary>
            <p className="my-2 text-xs text-surface-500">Nama dan bahan boleh diketik bebas. Hubungkan stok hanya bila pemakaiannya perlu dicatat.</p>
            <div className="space-y-1">
              {receipt.document.lines.map((line, index) => <div key={line.id} className="flex items-center gap-2 rounded border border-surface-100 p-2 text-xs">
                <span className="w-5 shrink-0 text-surface-400">{index + 1}</span><span className="min-w-0 flex-1 truncate">{line.name || "Baris kosong"}</span>
                <button type="button" className={`flex items-center gap-1 rounded px-2 py-1.5 focus-visible:ring-2 focus-visible:ring-brand-500 ${line.stockLink ? "bg-emerald-50 text-emerald-700" : "bg-surface-100 text-surface-600"}`} onClick={() => setStockLineId(line.id)}><Link2 size={13} />{line.stockLink ? `${line.stockLink.quantity} ${line.stockLink.unit}` : "Hubungkan stok"}</button>
                <button type="button" className="rounded p-1.5 text-danger-600 hover:bg-danger-50 focus-visible:ring-2 focus-visible:ring-danger-500" aria-label={`Hapus baris ${index + 1}`} onClick={() => editor.update({ ...receipt, document: { ...receipt.document, lines: receipt.document.lines.filter(item => item.id !== line.id) } })}><Trash2 size={14} /></button>
              </div>)}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" disabled={receipt.document.lines.length >= 200} onClick={() => editor.update({ ...receipt, document: { ...receipt.document, lines: [...receipt.document.lines, makeBlankLine()] } })}><Plus size={14} />Tambah baris</Button>
            </div>
            {receipt.subcategory !== "SPANDUK" && <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Input label="Keterangan pesanan" value={receipt.document.note} onChange={event => editor.update({ ...receipt, document: { ...receipt.document, note: event.target.value } })} />
              <Input label="Janji selesai" type="date" value={receipt.document.completionDate} onChange={event => editor.update({ ...receipt, document: { ...receipt.document, completionDate: event.target.value } })} />
            </div>}
          </details>}
        </> : <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <FilePlus2 size={36} className="text-brand-500" /><h2 className="text-lg font-bold text-surface-800">Nota {subcategory}</h2><p className="max-w-sm text-sm text-surface-500">Pilih nota tersimpan dari daftar atau buat nota kosong. Perubahan akan tersimpan otomatis.</p>
          <Button disabled={!canCreate || busy} onClick={() => void createRecord()}>Buat Nota Kosong</Button>
        </div>}
      </main>
    </div>
    {stockLine && editable && <PrintingReceiptStockLinkModal key={stockLine.id} line={stockLine} onClose={() => setStockLineId(null)} onSave={stockLink => editor.update({ ...receipt!, document: { ...receipt!.document, lines: receipt!.document.lines.map(line => line.id === stockLine.id ? { ...line, stockLink } : line) } })} />}
    {paymentReceipt && <PaymentModal open onClose={() => { if (!busy) { setPaymentReceipt(null); setError(null); } }} items={paymentItems} subtotal={getPrintingReceiptTotals(paymentReceipt).subtotal} initialCustomerSelection={initialCustomer} onConfirm={data => void checkout(data)} isProcessing={busy} allowItemDiscounts={false} receiptInvoiceDate={paymentReceipt.document.date} draftError={error} />}
    {previewReceipt && <PrintingReceiptModal open onClose={() => setPreviewReceipt(null)} receipt={previewReceipt} transaction={previewReceipt.transaction} />}
    <Modal open={Boolean(confirmAction)} onClose={() => { if (!busy) setConfirmAction(null); }} title={confirmAction === "delete" ? "Hapus draft nota?" : "Muat ulang versi tersimpan?"} size="sm">
      <p className="text-sm text-surface-600">{confirmAction === "delete" ? "Draft ini akan dihapus dari daftar nota. Nota yang sudah diproses tidak dapat dihapus di sini." : "Isian lokal yang belum tersimpan akan diganti dengan versi terbaru di server."}</p>
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" disabled={busy} onClick={() => setConfirmAction(null)}>Batal</Button><Button variant={confirmAction === "delete" ? "danger" : "primary"} loading={busy} onClick={() => void confirm()}>{confirmAction === "delete" ? <Trash2 size={15} /> : <RotateCcw size={15} />}{confirmAction === "delete" ? "Hapus draft" : "Muat ulang"}</Button></div>
    </Modal>
  </div>;
}
