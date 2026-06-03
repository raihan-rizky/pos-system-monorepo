"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, FileText, Minus, Plus } from "lucide-react";
import { Button, Modal } from "@pos/ui";
import { formatRupiah } from "@/lib/utils";
import type { ProductCartItem } from "@/hooks/useCart";
import type { DraftCreateInput } from "@/features/transactions-draft";
import {
  buildNotaPenawaranDraftInput,
  canViewQuotationHpp,
  updateQuoteLine,
  type QuotationProductLine,
  type QuotationRole,
} from "@/features/nota-penawaran/helpers/quotation-rules";

type QuoteEditorLine = QuotationProductLine & {
  currentPrice: number;
  costPrice?: number | null;
};

interface NotaPenawaranModalProps {
  open: boolean;
  items: ProductCartItem[];
  role: QuotationRole;
  isSaving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: DraftCreateInput, printDivision: string) => void | Promise<void>;
}

function toEditorLines(items: ProductCartItem[]): QuoteEditorLine[] {
  return items.map((item) => ({
    cartLineId: item.cartLineId,
    lineType: "PRODUCT",
    productId: item.productId,
    name: item.name,
    price: item.price,
    currentPrice: item.price,
    costPrice: item.costPrice ?? null,
    quantity: item.quantity,
    unit: item.unit,
    stock: item.stock,
    size: item.size ?? null,
    material: item.material ?? null,
  }));
}

export const NotaPenawaranModal: React.FC<NotaPenawaranModalProps> = ({
  open,
  items,
  role,
  isSaving = false,
  error,
  onClose,
  onSubmit,
}) => {
  const [kepadaYth, setKepadaYth] = useState("");
  const [printDivision, setPrintDivision] = useState("");
  const [lines, setLines] = useState<QuoteEditorLine[]>(() => toEditorLines(items));
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLines(toEditorLines(items));
    setLocalError(null);
  }, [items, open]);

  const showHpp = useMemo(() => canViewQuotationHpp(role), [role]);
  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.price * line.quantity, 0),
    [lines],
  );

  const handleLineChange = useCallback(
    (
      cartLineId: string,
      changes: Partial<Pick<QuoteEditorLine, "quantity" | "price">>,
    ) => {
      setLines((current) =>
        current.map((line) =>
          line.cartLineId === cartLineId
            ? { ...updateQuoteLine(line, changes), currentPrice: line.currentPrice, costPrice: line.costPrice }
            : line,
        ),
      );
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    setLocalError(null);
    try {
      const input = buildNotaPenawaranDraftInput({
        kepadaYth,
        division: printDivision,
        lines,
      });
      await onSubmit(input, printDivision.trim());
    } catch (submitError) {
      setLocalError(
        submitError instanceof Error
          ? submitError.message
          : "Gagal membuat nota penawaran",
      );
    }
  }, [kepadaYth, lines, onSubmit, printDivision]);

  const visibleError = localError || error;

  return (
    <Modal open={open} onClose={onClose} title="Create Nota Penawaran" size="4xl">
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p>
              Keranjang berisi produk dengan stok kosong. Simpan sebagai nota
              penawaran; stok akan dicek lagi saat nota disetujui menjadi
              transaksi.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label
              htmlFor="nota-kepada-yth"
              className="mb-1 block text-sm font-semibold text-surface-700"
            >
              Kepada Yth
            </label>
            <input
              id="nota-kepada-yth"
              value={kepadaYth}
              onChange={(event) => setKepadaYth(event.target.value)}
              className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="Nama perusahaan / instansi"
              disabled={isSaving}
            />
          </div>
          <div>
            <label
              htmlFor="nota-divisi"
              className="mb-1 block text-sm font-semibold text-surface-700"
            >
              Divisi / Bagian
            </label>
            <input
              id="nota-divisi"
              value={printDivision}
              onChange={(event) => setPrintDivision(event.target.value)}
              className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2.5 text-sm text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="Divisi Purchasing, Bagian Umum"
              disabled={isSaving}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-surface-200">
          <div className="grid grid-cols-[minmax(0,1.5fr)_90px_120px_180px] gap-3 bg-surface-50 px-4 py-2 text-xs font-bold uppercase text-surface-500">
            <span>Produk</span>
            <span className="text-center">Qty</span>
            <span className="text-right">Harga Nota</span>
            <span className="text-right">Info</span>
          </div>
          <div className="divide-y divide-surface-100">
            {lines.map((line) => (
              <div
                key={line.cartLineId}
                className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[minmax(0,1.5fr)_90px_120px_180px] md:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-surface-900">
                    {line.name}
                  </p>
                  <p className="mt-0.5 text-xs text-surface-500">
                    Stok: {line.stock} {line.unit}
                  </p>
                </div>
                <div className="flex items-center justify-start gap-1.5 md:justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      handleLineChange(line.cartLineId, {
                        quantity: line.quantity - 1,
                      })
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600 hover:bg-surface-50"
                    disabled={isSaving || line.quantity <= 1}
                    aria-label={`Kurangi qty ${line.name}`}
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(event) =>
                      handleLineChange(line.cartLineId, {
                        quantity: Number(event.target.value) || 1,
                      })
                    }
                    className="h-8 w-12 rounded-lg border border-surface-200 text-center text-sm font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    disabled={isSaving}
                    aria-label={`Qty ${line.name}`}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      handleLineChange(line.cartLineId, {
                        quantity: line.quantity + 1,
                      })
                    }
                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600 hover:bg-surface-50"
                    disabled={isSaving}
                    aria-label={`Tambah qty ${line.name}`}
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  value={line.price}
                  onChange={(event) =>
                    handleLineChange(line.cartLineId, {
                      price: Number(event.target.value) || 0,
                    })
                  }
                  className="h-9 rounded-lg border border-surface-200 px-2 text-right text-sm font-semibold text-surface-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  disabled={isSaving}
                  aria-label={`Harga nota ${line.name}`}
                />
                <div className="space-y-1 text-right text-xs text-surface-500">
                  <p>Harga: {formatRupiah(line.currentPrice)}</p>
                  {showHpp && line.costPrice != null && (
                    <>
                      <p>HPP: {formatRupiah(Number(line.costPrice))}</p>
                      <p>
                        Margin Asli: {formatRupiah(line.currentPrice - Number(line.costPrice))} ({line.currentPrice > 0 ? ((line.currentPrice - Number(line.costPrice)) / line.currentPrice * 100).toFixed(1) : "0.0"}%)
                      </p>
                      <p className={line.price - Number(line.costPrice) < 0 ? "text-red-500 font-medium" : "text-emerald-600 font-medium"}>
                        Margin Nota: {formatRupiah(line.price - Number(line.costPrice))} ({line.price > 0 ? ((line.price - Number(line.costPrice)) / line.price * 100).toFixed(1) : "0.0"}%)
                      </p>
                    </>
                  )}
                  {showHpp && line.costPrice == null && (
                    <p>HPP: -</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {visibleError && (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
          >
            {visibleError}
          </p>
        )}

        <div className="flex flex-col gap-3 border-t border-surface-100 pt-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase text-surface-400">
              Total Nota
            </p>
            <p className="text-xl font-extrabold text-surface-900">
              {formatRupiah(total)}
            </p>
          </div>
          <Button variant="secondary" size="lg" onClick={onClose} disabled={isSaving}>
            Batal
          </Button>
          <Button
            variant="accent"
            size="lg"
            onClick={handleSubmit}
            loading={isSaving}
            icon={<FileText size={18} />}
          >
            Simpan Nota Penawaran
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default NotaPenawaranModal;
