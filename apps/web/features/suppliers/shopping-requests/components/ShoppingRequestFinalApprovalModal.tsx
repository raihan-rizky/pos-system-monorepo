"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Modal } from "@pos/ui";
import type { Product } from "@/hooks/useProducts";
import { useFinalizeShoppingRequest, useRejectShoppingRequest, useShoppingRequest } from "../hooks/useShoppingRequests";
import { ProductAutocomplete } from "./ProductAutocomplete";
import { ShoppingRequestUnitSelect, type ShoppingUnitVariant } from "./ShoppingRequestUnitSelect";
import { useRole } from "@/components/providers/RoleProvider";
import { ProductStockThumbnail } from "@/features/inventory-management/components/ProductStockThumbnail";
import { shoppingRequestPaymentSchema, type ShoppingRequestPaymentMethod } from "../helpers/shopping-request-payment";

type DraftLine = {
  key: string;
  shoppingRequestItemId: string | null;
  productId: string;
  name: string;
  sku: string;
  imageUrl: string | null;
  unit: string;
  requestedUnit: string;
  stockGroupId: string | null;
  requestedQty: number | null;
  approvedQty: number;
  latestUnitPrice: number;
  costMissing: boolean;
  updateMasterHpp: boolean;
};

const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 });

export function ShoppingRequestFinalApprovalModal({ requestId, onClose }: { requestId: string | null; onClose: () => void }) {
  const { canPerform } = useRole();
  const canApprove = canPerform("supplier.goods_purchase.approve", "update");
  const canReject = canPerform("supplier.goods_purchase.reject", "update");
  const request = useShoppingRequest(requestId);
  const finalize = useFinalizeShoppingRequest();
  const reject = useRejectShoppingRequest();
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [confirmOverRequested, setConfirmOverRequested] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<ShoppingRequestPaymentMethod>("TRANSFER");
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const initializedRequestId = useRef<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = contentRef.current?.closest<HTMLElement>('[role="dialog"]');
    if (!requestId || !dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const outside = new Map<HTMLElement, boolean>();
    // Keep the backdrop interactive while excluding content outside this overlay.
    let branch = dialog.parentElement;
    while (branch && branch !== document.body) {
      const parent = branch.parentElement;
      if (!parent) break;
      for (const sibling of Array.from(parent.children)) {
        if (sibling !== branch && sibling instanceof HTMLElement) {
          outside.set(sibling, sibling.inert);
          sibling.inert = true;
        }
      }
      branch = parent;
    }
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])',
    )).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
    focusable()[0]?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = focusable();
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first || !last) return;
      if (!dialog.contains(document.activeElement) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.removeEventListener("keydown", trapFocus);
      outside.forEach((inert, element) => { element.inert = inert; });
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [requestId]);

  useEffect(() => {
    initializedRequestId.current = null;
    setLines([]);
    setConfirmOverRequested(false);
    setReason("");
    setError(null);
    setPaymentMethod("TRANSFER");
    setPaymentDueDate("");
  }, [requestId]);

  useEffect(() => {
    if (!requestId || request.data?.id !== requestId || initializedRequestId.current === requestId) return;
    initializedRequestId.current = requestId;
    setLines(request.data.items.map((item) => {
      const cost = item.product.costPrice;
      return {
        key: item.id,
        shoppingRequestItemId: item.id,
        productId: item.productId,
        name: item.productName,
        sku: item.productSku,
        imageUrl: item.imageUrl,
        unit: item.unit ?? "pcs",
        requestedUnit: item.unit ?? "pcs",
        stockGroupId: item.product.stockGroup?.id ?? null,
        requestedQty: item.requestedQty,
        approvedQty: item.requestedQty,
        latestUnitPrice: cost === null || cost === undefined ? 0 : Number(cost),
        costMissing: cost === null || cost === undefined,
        updateMasterHpp: true,
      };
    }));
    setError(null);
  }, [requestId, request.data]);

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((line) => line.key === key ? { ...line, ...patch } : line));
    setError(null);
  };
  const changeUnit = (key: string, variant: ShoppingUnitVariant) => {
    const current = lines.find((line) => line.key === key);
    if (!current) return;
    if (current.stockGroupId !== variant.stockGroupId || !variant.stockGroupId) {
      setError("Pilih satuan dari grup stok yang sama.");
      return;
    }
    if (lines.some((line) => line.key !== key && line.productId === variant.id)) {
      setError("Barang dengan satuan ini sudah ada di daftar belanja.");
      return;
    }
    updateLine(key, {
      productId: variant.id,
      name: variant.name,
      sku: variant.sku,
      imageUrl: variant.imageUrl,
      unit: variant.unit,
      stockGroupId: variant.stockGroupId,
      latestUnitPrice: variant.costPrice ?? 0,
      costMissing: variant.costPrice === null,
      updateMasterHpp: true,
    });
  };
  const addProduct = (product: Product) => {
    if (lines.some((line) => line.productId === product.id)) {
      setError("Barang ini sudah ada di daftar belanja.");
      return;
    }
    setLines((current) => [...current, {
      key: `extra-${product.id}`,
      shoppingRequestItemId: null,
      productId: product.id,
      name: product.name,
      sku: product.sku,
      imageUrl: product.imageUrl ?? null,
      unit: product.unit,
      requestedUnit: product.unit,
      stockGroupId: product.stockGroupId ?? product.stockGroup?.id ?? null,
      requestedQty: null,
      approvedQty: 1,
      latestUnitPrice: product.costPrice ?? 0,
      costMissing: product.costPrice === null,
      updateMasterHpp: true,
    }]);
    setError(null);
  };

  const hasOverRequested = lines.some((line) => line.requestedQty !== null && line.approvedQty > line.requestedQty);
  const total = lines.reduce((sum, line) => sum + line.approvedQty * line.latestUnitPrice, 0);
  const canSubmit = initializedRequestId.current === requestId && lines.some((line) => line.approvedQty > 0) &&
    lines.every((line) => Number.isFinite(line.approvedQty) && (line.shoppingRequestItemId ? line.approvedQty >= 0 : line.approvedQty > 0) && Number.isFinite(line.latestUnitPrice) && line.latestUnitPrice >= 0) &&
    (!hasOverRequested || confirmOverRequested) && !finalize.isPending && !reject.isPending &&
    shoppingRequestPaymentSchema.safeParse({ paymentMethod, paymentDueDate }).success;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requestId || !canSubmit) return;
    setError(null);
    try {
      await finalize.mutateAsync({
        id: requestId,
        input: {
          items: lines.filter((line) => line.shoppingRequestItemId).map((line) => ({
            shoppingRequestItemId: line.shoppingRequestItemId!,
            productId: line.productId,
            approvedQty: line.approvedQty,
            latestUnitPrice: line.latestUnitPrice,
            updateMasterHpp: line.updateMasterHpp,
          })),
          extraItems: lines.filter((line) => !line.shoppingRequestItemId).map((line) => ({
            productId: line.productId,
            quantity: line.approvedQty,
            latestUnitPrice: line.latestUnitPrice,
            updateMasterHpp: line.updateMasterHpp,
          })),
          confirmOverRequested,
          paymentMethod,
          paymentDueDate: paymentMethod === "GIRO" ? paymentDueDate : null,
        },
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Daftar belanja belum bisa disetujui.");
    }
  };
  const submitRejection = async () => {
    if (!requestId || reason.trim().length < 3) return;
    setError(null);
    try {
      await reject.mutateAsync({ id: requestId, reason });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Daftar belanja belum bisa ditolak.");
    }
  };

  return (
    <Modal open={requestId !== null} onClose={onClose} title="Setujui Daftar Belanja" size="6xl">
      <div ref={contentRef}>
      {!request.data ? <p className="p-6 text-sm text-slate-500">{request.isError ? "Daftar belanja belum bisa dimuat." : "Memuat daftar belanja..."}</p> : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600">Periksa jumlah dan harga beli. Pembelian dan pengeluaran dicatat saat Anda menyetujui.</p>
          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {lines.map((line) => (
              <article key={line.key} className="rounded-2xl border border-sky-200 bg-white p-4 [&_select]:h-12 [&_select]:text-base">
                <div className="flex items-start gap-3">
                  <ProductStockThumbnail name={line.name} imageUrl={line.imageUrl} size="lg" className="border-sky-100 bg-sky-50" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-bold leading-snug text-slate-900">{line.name}</p>
                    <p className="mt-1 break-all text-xs text-slate-500">{line.sku}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span aria-label={`Satuan pembelian: ${line.unit}`} className="inline-flex rounded-md bg-sky-100 px-2 py-1 text-xs font-bold text-sky-800">Satuan pembelian: {line.unit}</span>
                      <span className="inline-flex rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">{line.requestedQty !== null ? `Permintaan awal: ${line.requestedQty} ${line.requestedUnit}` : "Barang tambahan"}</span>
                    </div>
                  </div>
                  {!line.shoppingRequestItemId && <button type="button" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} aria-label={`Hapus ${line.name}`} className="min-h-11 rounded-lg px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500">Hapus</button>}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-bold text-slate-600">Jumlah
                    <input type="number" inputMode="decimal" min={line.shoppingRequestItemId ? "0" : "0.01"} step="0.01" value={line.approvedQty} onChange={(event) => updateLine(line.key, { approvedQty: Number(event.target.value) })} className="mt-1 h-12 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-right text-base font-semibold text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100" />
                  </label>
                  <ShoppingRequestUnitSelect productId={line.productId} unit={line.unit} stockGroupId={line.stockGroupId} onChange={(variant) => changeUnit(line.key, variant)} />
                  <label className="text-xs font-bold text-slate-600">Harga Beli
                    <input type="number" inputMode="decimal" min="0" step="0.01" value={line.latestUnitPrice} onChange={(event) => updateLine(line.key, { latestUnitPrice: Number(event.target.value) })} className="mt-1 h-12 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-right text-base font-semibold text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100" />
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                  <span>{line.approvedQty === 0 ? "Barang ini tidak disetujui" : `Total ${currency.format(line.approvedQty * line.latestUnitPrice)}`}</span>
                  {line.costMissing && <span className="text-amber-700">HPP awal belum tersedia; periksa harga beli.</span>}
                </div>
                <details className="mt-2 text-xs text-slate-600"><summary className="min-h-11 cursor-pointer rounded-lg py-3 font-semibold hover:text-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-500">Pilihan HPP</summary>
                  <label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={line.updateMasterHpp} onChange={(event) => updateLine(line.key, { updateMasterHpp: event.target.checked })} className="h-4 w-4 accent-cyan-600" /> Perbarui HPP master ke harga beli ini</label>
                </details>
              </article>
            ))}
            <div className="rounded-xl border border-dashed border-sky-200 bg-sky-50/50 p-3"><p className="mb-2 text-xs font-bold text-sky-800">Tambah barang lain bila diperlukan</p><ProductAutocomplete onSelect={addProduct} /></div>
          </div>
          {hasOverRequested && <label className="flex items-start gap-2 text-xs text-amber-800"><input type="checkbox" checked={confirmOverRequested} onChange={(event) => setConfirmOverRequested(event.target.checked)} /> Saya sudah memeriksa jumlah yang melebihi kebutuhan.</label>}
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {canReject && <details className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm"><summary className="cursor-pointer rounded font-semibold text-rose-700 hover:text-rose-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400">Tolak daftar belanja</summary>
            <label className="mt-3 block text-xs font-bold text-rose-700">Alasan penolakan
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-1 min-h-20 w-full rounded-lg border border-rose-200 bg-white p-2 text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" placeholder="Jelaskan alasan penolakan" />
            </label>
            <Button type="button" variant="danger" className="!bg-rose-600 hover:!bg-rose-700 focus:!ring-rose-400" disabled={reason.trim().length < 3 || reject.isPending} onClick={submitRejection}>Tolak Daftar Belanja</Button>
          </details>}
          <footer className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-200 bg-white py-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <p className="font-bold text-emerald-800 sm:pb-3">Total Pengeluaran: {currency.format(total)}</p>
              <label className="text-xs font-bold text-slate-600">Metode Pembayaran
                <select name="paymentMethod" value={paymentMethod} disabled={!canApprove || finalize.isPending || reject.isPending} onChange={(event) => {
                  setPaymentMethod(event.target.value as ShoppingRequestPaymentMethod);
                  setPaymentDueDate("");
                  setError(null);
                }} className="mt-1 block h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-semibold text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50 sm:w-36">
                  <option value="TRANSFER">Transfer</option>
                  <option value="GIRO">Giro</option>
                </select>
              </label>
              {paymentMethod === "GIRO" && <label className="text-xs font-bold text-slate-600">Tanggal Jatuh Tempo
                <input type="date" name="paymentDueDate" required value={paymentDueDate} disabled={!canApprove || finalize.isPending || reject.isPending} onChange={(event) => {
                  setPaymentDueDate(event.target.value);
                  setError(null);
                }} className="mt-1 block h-12 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base font-semibold text-slate-900 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-50 sm:w-44" />
              </label>}
            </div>
            <div className="grid gap-2 sm:flex"><Button type="button" variant="secondary" onClick={onClose}>Kembali</Button>{canApprove && <Button type="submit" className="!bg-emerald-600 hover:!bg-emerald-700 focus:!ring-emerald-400" disabled={!canSubmit} loading={finalize.isPending}>Setujui dan Catat Pembelian</Button>}</div>
          </footer>
        </form>
      )}
      </div>
    </Modal>
  );
}
