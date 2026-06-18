"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Modal } from "@pos/ui";
import { History } from "lucide-react";
import type { Product } from "@/hooks/useProducts";
import { useUpdateProduct } from "@/hooks/useProducts";
import { buildPriceChangePayload } from "@/features/product-price-change/helpers/price-change-form";

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
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !product) return;
    setPrice(String(product.price));
    setCostPrice(product.costPrice == null ? "" : String(product.costPrice));
    setHargaDinas(product.hargaDinas == null ? "" : String(product.hargaDinas));
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
      nextPrice: price,
      nextCostPrice: costPrice,
      nextHargaDinas: hargaDinas,
      note,
    });
  }, [costPrice, hargaDinas, note, price, product]);

  const canSave = Boolean(payload) && Number(price) >= 0;
  const showHargaDinasWarning =
    hargaDinas.trim() !== "" && Number(hargaDinas) < Number(price || "0");

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setError(null);

      if (!product || !payload) {
        setError("Ubah harga jual atau HPP sebelum menyimpan.");
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
