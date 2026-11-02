"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Input, Modal } from "@pos/ui";
import { History, Tag, RotateCcw, Info } from "lucide-react";
import type { Product } from "@/hooks/useProducts";
import type { ProductCartItem } from "@/hooks/useCart";
import { useUpdateProduct } from "@/hooks/useProducts";
import { ProductPricingAction } from "@/features/product-stock-groups/components/ProductPricingAction";
import { PriceRoundingPreview } from "@/features/product-price-rounding/components/PriceRoundingPreview";
import type { PriceRoundingSettings } from "@/features/product-price-rounding/rounding";
import { roundSellingPrice } from "@/features/product-price-rounding/rounding";
import { TransactionCustomPriceBadge } from "@/features/pos-checkout/components/TransactionCustomPriceBadge";
import { MemberPriceField } from "@/features/customer-category-pricing/components/MemberPriceField";
import { MemberPricingGuidance } from "@/features/customer-category-pricing/components/MemberPricingGuidance";
import { formatRupiah } from "@/lib/utils";
import {
  buildPriceChangePayload,
} from "@/features/product-price-change/helpers/price-change-form";

interface PriceUpdateModalProps {
  roundingSettings?: PriceRoundingSettings;
  isOpen: boolean;
  product: Product | null;
  onClose: () => void;
  onViewHistory: (productId: string) => void;
}

export default function PriceUpdateModal({
  isOpen,
  product,
  onClose,
  onViewHistory,
  roundingSettings,
}: PriceUpdateModalProps) {
  const updateProduct = useUpdateProduct();
  const initializedProduct = useRef<string | null>(null);
  const price = String(product?.price ?? "");
  const costPrice = product?.costPrice == null ? "" : String(product.costPrice);
  const [hargaDinas, setHargaDinas] = useState("");
  const [hargaAgen, setHargaAgen] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) initializedProduct.current = null;
    if (!isOpen || !product || initializedProduct.current === product.id) return;
    initializedProduct.current = product.id;
    setHargaDinas(Number(product.hargaDinas) > 0 ? String(product.hargaDinas) : "");
    setHargaAgen(Number(product.hargaAgen) > 0 ? String(product.hargaAgen) : "");
    setNote("");
    setError(null);
  }, [isOpen, product]);

  const payload = useMemo(() => {
    if (!product) return null;
    return buildPriceChangePayload({
      productId: product.id,
      currentPrice: product.price,
      currentCostPrice: product.costPrice,
      currentHargaDinas: product.hargaDinas,
      currentHargaAgen: product.hargaAgen,
      nextPrice: price,
      nextCostPrice: costPrice,
      nextHargaDinas: hargaDinas,
      nextHargaAgen: hargaAgen,
      note,
    });
  }, [costPrice, hargaAgen, hargaDinas, note, price, product]);

  const canSave = Boolean(payload) && Number(price) >= 0;
  const showHargaDinasWarning =
    hargaDinas.trim() !== "" && Number(hargaDinas) < Number(price || "0");
  const showHargaAgenWarning =
    hargaAgen.trim() !== "" && Number(hargaAgen) < Number(price || "0");

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);

      if (!product || !payload) {
        setError("Ubah Harga Dinas atau Harga Agen sebelum menyimpan. Harga jual dan HPP diterapkan melalui Harga grup.");
        return;
      }

      try {
        await updateProduct.mutateAsync(payload);
        onClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Gagal mengubah harga");
      }
    },
    [onClose, payload, product, updateProduct],
  );

  const handleViewHistory = useCallback(() => {
    if (!product) return;
    onViewHistory(product.id);
    onClose();
  }, [onClose, onViewHistory, product]);

  if (!product) return null;

  return (
    <Modal open={isOpen} onClose={onClose} title="Ubah Harga Produk">
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-black text-slate-900">{product.name}</p>
          <p className="text-xs font-semibold text-slate-500">{product.sku}</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600">
            {error}
          </div>
        )}

        <ProductPricingAction groupId={product.stockGroupId ?? product.stockGroup?.id} identityChanged={false} disabled={updateProduct.isPending} />
        <p className="text-xs text-slate-600">Simpan Harga hanya menyimpan Harga Agen dan Harga Dinas pada produk ini.</p>
        <p className="text-xs text-surface-500">Harga master asal sebelum pembulatan.</p>
          <PriceRoundingPreview price={price} settings={roundingSettings} />
          <MemberPricingGuidance />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <MemberPriceField
              roundingSettings={roundingSettings}
              label="Harga Dinas"
              sellingPrice={product.price}
              value={hargaDinas}
              onChange={setHargaDinas}
              disabled={updateProduct.isPending}
            />
            {showHargaDinasWarning && (
              <p className="text-xs font-medium text-amber-700">
                Harga Dinas lebih rendah dari harga jual.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <MemberPriceField
              roundingSettings={roundingSettings}
              label="Harga Agen"
              sellingPrice={product.price}
              value={hargaAgen}
              onChange={setHargaAgen}
              disabled={updateProduct.isPending}
            />
            {showHargaAgenWarning && (
              <p className="text-xs font-medium text-amber-700">
                Harga Agen lebih rendah dari harga jual.
              </p>
            )}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-surface-700">
            Catatan perubahan harga
          </label>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Opsional, contoh: harga supplier naik"
            className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-surface-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            onClick={handleViewHistory}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <History className="h-4 w-4" />
            Lihat Riwayat Harga
          </button>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" disabled={!canSave || updateProduct.isPending}>
              {updateProduct.isPending ? "Menyimpan..." : "Simpan Harga"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export type PosCartPriceUpdate = { transactionPrice: number | null };

interface PosPriceQuickEditModalProps {
  roundingSettings?: PriceRoundingSettings;
  open: boolean;
  item: ProductCartItem | null;
  onClose: () => void;
  onSave: (input: PosCartPriceUpdate) => void | Promise<void>;
}

export function PosPriceQuickEditModal({
  open, item, onClose, onSave, roundingSettings,
}: PosPriceQuickEditModalProps) {
  const initializedProduct = useRef<string | null>(null);
  const [transactionPrice, setTransactionPrice] = useState(() =>
    item == null ? "" : String(item.transactionPrice ?? item.price),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const inputId = React.useId();
  const numericPrice = Number(transactionPrice.trim().replace(",", "."));
  const automaticPrice = item?.automaticPrice ?? item?.catalogPrice ?? 0;
  let previewPrice: number | null = null;
  try {
    if (transactionPrice.trim() && numericPrice > 0) {
      previewPrice = roundSellingPrice(numericPrice, roundingSettings).roundedPrice;
    }
  } catch {
    // Submission reports invalid or oversized amounts without breaking the preview.
  }

  useEffect(() => {
    if (!open) initializedProduct.current = null;
    if (!open || !item || initializedProduct.current === item.cartLineId) return;
    initializedProduct.current = item.cartLineId;
    setTransactionPrice(String(item.transactionPrice ?? item.price));
    setError(null);
  }, [item, open]);

  const savePrice = async (price: number | null) => {
    if (isSaving) return;
    setError(null);
    if (price !== null && (!transactionPrice.trim() || !Number.isFinite(price) || price <= 0 || previewPrice === null)) {
      setError("Masukkan harga custom lebih dari 0 dengan nilai yang valid.");
      return;
    }
    setIsSaving(true);
    try {
      await onSave({ transactionPrice: price });
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Harga nota belum dapat diterapkan. Coba lagi.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!item) return null;

  return (
    <Modal open={open} onClose={isSaving ? () => {} : onClose} title="Ubah Harga Nota">
      <form onSubmit={event => { event.preventDefault(); void savePrice(numericPrice); }} className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl border border-surface-200 bg-surface-50 p-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-500">
            <Tag className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="break-words text-sm font-bold text-surface-900">{item.name}</p>
            <p className="mt-1 text-xs text-surface-500">{item.quantity} {item.unit} dalam nota ini</p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={inputId} className="text-sm font-semibold text-surface-900">Harga custom per satuan</label>
            <TransactionCustomPriceBadge />
          </div>
          <div className={`flex items-center gap-3 rounded-xl border bg-white px-4 transition-shadow focus-within:ring-4 ${error ? "border-danger-400 focus-within:ring-danger-100" : "border-brand-300 focus-within:border-brand-500 focus-within:ring-brand-100"}`}>
            <span className="text-lg font-semibold text-surface-400" aria-hidden="true">Rp</span>
            <input
              id={inputId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              value={transactionPrice}
              onFocus={event => event.currentTarget.select()}
              onChange={event => { setTransactionPrice(event.target.value); setError(null); }}
              disabled={isSaving}
              aria-invalid={Boolean(error)}
              aria-describedby={`${inputId}-hint${error ? ` ${inputId}-error` : ""}`}
              className="min-h-16 min-w-0 flex-1 bg-transparent py-3 text-3xl font-bold tracking-tight text-surface-900 outline-none tabular-nums disabled:opacity-50"
            />
            <span className="shrink-0 text-xs font-medium text-surface-500">/ {item.unit}</span>
          </div>
          <p id={`${inputId}-hint`} className="mt-2 text-xs leading-relaxed text-surface-500">
            Harga otomatis <span className="font-semibold text-surface-700">{formatRupiah(automaticPrice)}</span> / {item.unit}
          </p>
          {error && <p id={`${inputId}-error`} role="alert" className="mt-2 text-xs font-medium text-danger-600">{error}</p>}
          <PriceRoundingPreview price={transactionPrice.replace(",", ".")} settings={roundingSettings} label="Harga berlaku" />
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-amber-900">
          <div className="flex gap-2.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold">Hanya berlaku untuk nota ini</p>
              <p className="mt-1 text-xs leading-relaxed text-amber-800">Harga produk tetap sama. Nota berikutnya kembali memakai harga otomatis.</p>
            </div>
          </div>
        </div>

        {item.costPrice != null && previewPrice != null && previewPrice < item.costPrice && (
          <p className="text-xs font-medium text-amber-800" role="status">Harga custom di bawah HPP. Periksa kembali sebelum menerapkan.</p>
        )}

        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-50 px-4 py-3">
          <div>
            <p className="text-xs font-medium text-surface-500">Subtotal item</p>
            <p className="mt-0.5 text-xs text-surface-500">{item.quantity} {item.unit} × {previewPrice == null ? "—" : formatRupiah(previewPrice)}</p>
          </div>
          <p className="text-lg font-bold text-surface-900 tabular-nums" aria-live="polite">{previewPrice == null ? "—" : formatRupiah(previewPrice * item.quantity)}</p>
        </div>

        <div className="space-y-3 border-t border-surface-200 pt-4">
          <button
            type="button"
            onClick={() => void savePrice(null)}
            disabled={isSaving || item.transactionPrice == null}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold text-surface-600 transition-colors hover:bg-surface-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Kembalikan harga otomatis
          </button>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving} className="flex-1">Batal</Button>
            <Button type="submit" disabled={isSaving} className="flex-1">
              {isSaving ? "Menerapkan..." : "Terapkan harga"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
