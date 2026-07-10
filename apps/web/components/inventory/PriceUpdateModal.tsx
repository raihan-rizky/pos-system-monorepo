"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Modal } from "@pos/ui";
import { History } from "lucide-react";
import type { Product } from "@/hooks/useProducts";
import type { ProductCartItem } from "@/hooks/useCart";
import { useUpdateProduct } from "@/hooks/useProducts";
import {
  buildPosCartPriceUpdate,
  buildPriceChangePayload,
} from "@/features/product-price-change/helpers/price-change-form";

interface PriceUpdateModalProps {
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
}: PriceUpdateModalProps) {
  const updateProduct = useUpdateProduct();
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [hargaDinas, setHargaDinas] = useState("");
  const [hargaAgen, setHargaAgen] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !product) return;
    setPrice(String(product.price));
    setCostPrice(product.costPrice == null ? "" : String(product.costPrice));
    setHargaDinas(product.hargaDinas == null ? "" : String(product.hargaDinas));
    setHargaAgen(product.hargaAgen == null ? "" : String(product.hargaAgen));
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
        setError("Ubah harga jual, HPP, Harga Dinas, atau Harga Agen sebelum menyimpan.");
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Harga Jual (IDR)"
            type="number"
            min="0"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            required
          />
          <Input
            label="Harga Modal / HPP"
            type="number"
            min="0"
            placeholder="Opsional"
            value={costPrice}
            onChange={(event) => setCostPrice(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Input
              label="Harga Dinas"
              type="number"
              min="0"
              placeholder="Opsional"
              value={hargaDinas}
              onChange={(event) => setHargaDinas(event.target.value)}
            />
            {showHargaDinasWarning && (
              <p className="text-xs font-medium text-amber-700">
                Harga Dinas lebih rendah dari harga jual.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Input
              label="Harga Agen"
              type="number"
              min="0"
              placeholder="Opsional"
              value={hargaAgen}
              onChange={(event) => setHargaAgen(event.target.value)}
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

export type PosCartPriceUpdate = ReturnType<typeof buildPosCartPriceUpdate>;

interface PosPriceQuickEditModalProps {
  open: boolean;
  item: ProductCartItem | null;
  onClose: () => void;
  onSave: (input: PosCartPriceUpdate) => void | Promise<void>;
}

export function PosPriceQuickEditModal({
  open,
  item,
  onClose,
  onSave,
}: PosPriceQuickEditModalProps) {
  const [price, setPrice] = useState(() => item == null ? "" : String(item.catalogPrice));
  const [hargaDinas, setHargaDinas] = useState(() =>
    item?.hargaDinas == null ? "" : String(item.hargaDinas),
  );
  const [hargaAgen, setHargaAgen] = useState(() =>
    item?.hargaAgen == null ? "" : String(item.hargaAgen),
  );
  const [transactionPrice, setTransactionPrice] = useState(() =>
    item?.transactionPrice == null ? "" : String(item.transactionPrice),
  );
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const currentTransactionPrice =
    transactionPrice.trim() !== ""
      ? Number(transactionPrice)
      : null;
  const showTransactionBelowCostWarning =
    item?.costPrice != null &&
    currentTransactionPrice != null &&
    currentTransactionPrice < item.costPrice;
  const masterPricesBelowCost = item?.costPrice == null
    ? []
    : [
        { label: "Harga Normal", value: price },
        { label: "Harga Agen", value: hargaAgen },
        { label: "Harga Dinas", value: hargaDinas },
      ].filter(
        (entry) =>
          entry.value.trim() !== "" &&
          Number.isFinite(Number(entry.value)) &&
          Number(entry.value) < item.costPrice!,
      );

  useEffect(() => {
    if (!open || !item) return;
    setPrice(String(item.catalogPrice));
    setHargaDinas(item.hargaDinas == null ? "" : String(item.hargaDinas));
    setHargaAgen(item.hargaAgen == null ? "" : String(item.hargaAgen));
    setTransactionPrice(
      item.transactionPrice == null ? "" : String(item.transactionPrice),
    );
    setNote("");
    setError(null);
  }, [item, open]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!item) return;
      setError(null);

      try {
        const update = buildPosCartPriceUpdate({
          productId: item.productId,
          currentPrice: item.catalogPrice,
          currentHargaDinas: item.hargaDinas ?? null,
          currentHargaAgen: item.hargaAgen ?? null,
          nextPrice: price,
          nextHargaDinas: hargaDinas,
          nextHargaAgen: hargaAgen,
          transactionPrice,
          note,
        });
        setIsSaving(true);
        await onSave(update);
        onClose();
      } catch (saveError) {
        setError(
          saveError instanceof Error ? saveError.message : "Gagal mengubah harga produk.",
        );
      } finally {
        setIsSaving(false);
      }
    },
    [hargaAgen, hargaDinas, item, note, onClose, onSave, price, transactionPrice],
  );

  if (!item) return null;

  return (
    <Modal open={open} onClose={onClose} title="Ubah Harga Produk">
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-black text-slate-900">{item.name}</p>
          <p className="text-xs font-semibold text-slate-500">{item.unit}</p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm font-medium text-red-600" role="alert">
            {error}
          </div>
        )}

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-bold text-surface-900">Harga master</h3>
            <p className="text-xs text-surface-500">Perubahan berlaku untuk transaksi berikutnya.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label="Harga Normal"
              type="number"
              min="1"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
            />
            <Input
              label="Harga Agen"
              type="number"
              min="0"
              placeholder="Opsional"
              value={hargaAgen}
              onChange={(event) => setHargaAgen(event.target.value)}
            />
            <Input
              label="Harga Dinas"
              type="number"
              min="0"
              placeholder="Opsional"
              value={hargaDinas}
              onChange={(event) => setHargaDinas(event.target.value)}
            />
          </div>
          {masterPricesBelowCost.map((entry) => (
            <p key={entry.label} className="text-xs font-semibold text-amber-700">
              {entry.label} di bawah HPP. Anda tetap dapat menyimpan perubahan ini.
            </p>
          ))}
          <div>
            <label className="mb-1 block text-sm font-medium text-surface-700">Catatan perubahan harga</label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Opsional"
              className="w-full rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </section>

        <section className="space-y-2 rounded-2xl border border-brand-100 bg-brand-50/50 p-4">
          <div>
            <h3 className="text-sm font-bold text-brand-950">Harga Khusus</h3>
            <p className="text-xs text-brand-800">Hanya berlaku untuk transaksi ini.</p>
          </div>
          <Input
            label="Harga Khusus"
            type="number"
            min="1"
            placeholder="Opsional"
            value={transactionPrice}
            onChange={(event) => setTransactionPrice(event.target.value)}
          />
          {showTransactionBelowCostWarning && (
            <p className="text-xs font-semibold text-amber-700">
              Harga khusus di bawah HPP. Anda tetap dapat menyimpan perubahan ini.
            </p>
          )}
        </section>

        <div className="flex justify-end gap-3 border-t border-surface-200 pt-5">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Batal
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Menyimpan..." : "Simpan Harga"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
