"use client";

import { useEffect, useState } from "react";
import { Button, Modal } from "@pos/ui";
import type { Product } from "@/hooks/useProducts";
import { useFinalizeShoppingRequest, useRejectShoppingRequest, useShoppingRequest } from "../hooks/useShoppingRequests";
import { ProductAutocomplete } from "./ProductAutocomplete";
import { ShoppingRequestUnitSelect, type ShoppingUnitVariant } from "./ShoppingRequestUnitSelect";
import { useRole } from "@/components/providers/RoleProvider";

type DraftLine = {
  key: string;
  shoppingRequestItemId: string | null;
  productId: string;
  name: string;
  sku: string;
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

  useEffect(() => {
    if (!request.data) return;
    setLines(request.data.items.map((item) => {
      const cost = item.product.costPrice;
      return {
        key: item.id,
        shoppingRequestItemId: item.id,
        productId: item.productId,
        name: item.productName,
        sku: item.productSku,
        unit: item.unit ?? "pcs",
        requestedUnit: item.unit ?? "pcs",
        stockGroupId: item.product.stockGroup?.id ?? null,
        requestedQty: item.requestedQty,
        approvedQty: item.requestedQty,
        latestUnitPrice: cost === null || cost === undefined ? 0 : Number(cost),
        costMissing: cost === null || cost === undefined,
        updateMasterHpp: false,
      };
    }));
    setError(null);
  }, [request.data]);

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
      unit: variant.unit,
      stockGroupId: variant.stockGroupId,
      latestUnitPrice: variant.costPrice ?? 0,
      costMissing: variant.costPrice === null,
      updateMasterHpp: false,
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
      unit: product.unit,
      requestedUnit: product.unit,
      stockGroupId: product.stockGroupId ?? product.stockGroup?.id ?? null,
      requestedQty: null,
      approvedQty: 1,
      latestUnitPrice: product.costPrice ?? 0,
      costMissing: product.costPrice === null,
      updateMasterHpp: false,
    }]);
    setError(null);
  };

  const hasOverRequested = lines.some((line) => line.requestedQty !== null && line.approvedQty > line.requestedQty);
  const total = lines.reduce((sum, line) => sum + line.approvedQty * line.latestUnitPrice, 0);
  const canSubmit = lines.some((line) => line.approvedQty > 0) &&
    lines.every((line) => Number.isFinite(line.approvedQty) && (line.shoppingRequestItemId ? line.approvedQty >= 0 : line.approvedQty > 0) && Number.isFinite(line.latestUnitPrice) && line.latestUnitPrice >= 0) &&
    (!hasOverRequested || confirmOverRequested);

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
      {!request.data ? <p className="p-6 text-sm text-slate-500">{request.isError ? "Daftar belanja belum bisa dimuat." : "Memuat daftar belanja..."}</p> : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600">Periksa jumlah dan harga beli. Pembelian dan pengeluaran dicatat saat Anda menyetujui.</p>
          <div className="max-h-[52vh] space-y-3 overflow-y-auto pr-1">
            {lines.map((line) => (
              <article key={line.key} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div><p className="font-bold text-slate-900">{line.name}</p><p className="text-xs text-slate-500">{line.sku}{line.requestedQty !== null ? ` · Kebutuhan ${line.requestedQty} ${line.requestedUnit}` : " · Barang tambahan"}</p></div>
                  {!line.shoppingRequestItemId && <button type="button" onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))} className="text-xs font-semibold text-rose-600">Hapus</button>}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-bold text-slate-600">Jumlah
                    <input type="number" min={line.shoppingRequestItemId ? "0" : "0.01"} step="0.01" value={line.approvedQty} onChange={(event) => updateLine(line.key, { approvedQty: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-right text-sm" />
                  </label>
                  <ShoppingRequestUnitSelect productId={line.productId} unit={line.unit} stockGroupId={line.stockGroupId} onChange={(variant) => changeUnit(line.key, variant)} />
                  <label className="text-xs font-bold text-slate-600">Harga Beli
                    <input type="number" min="0" step="0.01" value={line.latestUnitPrice} onChange={(event) => updateLine(line.key, { latestUnitPrice: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-right text-sm" />
                  </label>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                  <span>{line.approvedQty === 0 ? "Barang ini tidak disetujui" : `Total ${currency.format(line.approvedQty * line.latestUnitPrice)}`}</span>
                  {line.costMissing && <span className="text-amber-700">HPP awal belum tersedia; periksa harga beli.</span>}
                </div>
                <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer font-semibold">Pilihan HPP</summary>
                  <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={line.updateMasterHpp} onChange={(event) => updateLine(line.key, { updateMasterHpp: event.target.checked })} /> Perbarui HPP master ke harga beli ini</label>
                </details>
              </article>
            ))}
            <div className="rounded-xl border border-dashed border-slate-200 p-3"><p className="mb-2 text-xs font-bold text-slate-600">Tambah barang lain bila diperlukan</p><ProductAutocomplete onSelect={addProduct} /></div>
          </div>
          {hasOverRequested && <label className="flex items-start gap-2 text-xs text-amber-800"><input type="checkbox" checked={confirmOverRequested} onChange={(event) => setConfirmOverRequested(event.target.checked)} /> Saya sudah memeriksa jumlah yang melebihi kebutuhan.</label>}
          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
          {canReject && <details className="rounded-lg border border-slate-200 p-3 text-sm"><summary className="cursor-pointer font-semibold text-slate-700">Tolak daftar belanja</summary>
            <label className="mt-3 block text-xs font-bold text-slate-600">Alasan penolakan
              <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 p-2 text-sm" placeholder="Jelaskan alasan penolakan" />
            </label>
            <Button type="button" variant="secondary" disabled={reason.trim().length < 3 || reject.isPending} onClick={submitRejection}>Tolak Daftar Belanja</Button>
          </details>}
          <footer className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-200 bg-white py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-bold text-slate-900">Total Pengeluaran: {currency.format(total)}</p>
            <div className="flex gap-2"><Button type="button" variant="secondary" onClick={onClose}>Kembali</Button>{canApprove && <Button type="submit" disabled={!canSubmit} loading={finalize.isPending}>Setujui dan Catat Pembelian</Button>}</div>
          </footer>
        </form>
      )}
    </Modal>
  );
}
