"use client";

import React, { useEffect, useState } from "react";
import { PencilLine, ShoppingCart, Trash2 } from "lucide-react";
import { Button, Modal } from "@pos/ui";

import type { Product } from "@/hooks/useProducts";
import { SupplierSelector } from "@/features/suppliers/components/SupplierSelector";
import { ProductStockThumbnail } from "@/features/inventory-management/components/ProductStockThumbnail";
import {
  useShoppingRequest,
  useUpdateShoppingRequest,
} from "../hooks/useShoppingRequests";
import { defaultShoppingRequestStockMode } from "../helpers/shopping-requests-core";
import type {
  ShoppingRequestDetail,
  ShoppingRequestStockMode,
} from "../types/shopping-request";
import { ProductAutocomplete } from "./ProductAutocomplete";

interface EditItem {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  imageUrl: string | null;
  stock: number;
  stockGroupId: string | null;
  stockGroupName: string | null;
  requestedQty: number;
  stockMode: ShoppingRequestStockMode;
}

export function ShoppingRequestEditModal({
  detail,
  open,
  onClose,
}: {
  detail: ShoppingRequestDetail | null;
  open: boolean;
  onClose: () => void;
}) {
  const fullDetail = useShoppingRequest(open ? detail?.id ?? null : null);
  const updateRequest = useUpdateShoppingRequest();
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<EditItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fullDetail.data) return;
    setSupplierId(fullDetail.data.supplierId ?? "");
    setNote(fullDetail.data.note ?? "");
    setItems(
      fullDetail.data.items.map((item) => ({
        productId: item.productId,
        name: item.productName,
        sku: item.productSku,
        unit: item.unit ?? "pcs",
        imageUrl: item.imageUrl,
        stock: item.stockOnHand,
        stockGroupId: item.product.stockGroup?.id ?? null,
        stockGroupName: item.product.stockGroup?.displayName ?? null,
        requestedQty: item.requestedQty,
        stockMode: item.stockMode,
      })),
    );
    setError(null);
  }, [fullDetail.data]);

  const addProduct = (product: Product) => {
    setItems((current) =>
      current.some((item) => item.productId === product.id)
        ? current
        : [
            {
              productId: product.id,
              name: product.name,
              sku: product.sku,
              unit: product.unit,
              imageUrl: product.imageUrl,
              stock: product.stock,
              stockGroupId: product.stockGroupId ?? product.stockGroup?.id ?? null,
              stockGroupName: product.stockGroup?.displayName ?? null,
              requestedQty: 1,
              stockMode: defaultShoppingRequestStockMode(
                product.stockGroupId ?? product.stockGroup?.id,
              ),
            },
            ...current,
          ],
    );
  };

  const updateItem = (
    productId: string,
    patch: Partial<Pick<EditItem, "requestedQty" | "stockMode">>,
  ) =>
    setItems((current) =>
      current.map((item) =>
        item.productId === productId ? { ...item, ...patch } : item,
      ),
    );

  const save = async () => {
    if (!detail || !supplierId || items.length === 0) return;
    setError(null);
    try {
      await updateRequest.mutateAsync({
        id: detail.id,
        input: {
          supplierId,
          note: note || null,
          items: items.map((item) => ({
            productId: item.productId,
            requestedQty: item.requestedQty,
            stockMode: item.stockMode,
          })),
        },
      });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Gagal memperbarui permohonan belanja",
      );
    }
  };

  const canSave =
    Boolean(supplierId) &&
    items.length > 0 &&
    items.every((item) => item.requestedQty > 0);

  return (
    <Modal open={open} onClose={onClose} title="Edit Permohonan Belanja" size="4xl">
      {fullDetail.isPending ? (
        <div className="p-8 text-center text-sm font-semibold text-slate-500">
          Memuat detail permohonan...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <SupplierSelector
              value={supplierId}
              onChange={setSupplierId}
              error={!supplierId ? "Supplier wajib dipilih" : null}
            />
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <span className="mb-1.5 block text-sm font-bold text-slate-700">
                Cari & Tambah Produk
              </span>
              <ProductAutocomplete onSelect={addProduct} />
            </div>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
              <h3 className="flex items-center gap-2 font-black text-slate-900">
                <ShoppingCart className="h-5 w-5 text-cyan-600" /> Daftar Barang ({items.length})
              </h3>
              <span className="text-xs font-semibold text-slate-500">
                Perubahan produk atau kebutuhan mengosongkan Jumlah yang Di-ACC.
              </span>
            </header>
            <div className="max-h-[43vh] space-y-3 overflow-y-auto p-3">
              {items.map((item) => (
                <article key={item.productId} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start gap-3">
                    <ProductStockThumbnail name={item.name} imageUrl={item.imageUrl} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black text-slate-950">{item.name}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        {item.sku} · Stok {item.stock} {item.unit}
                      </p>
                      {item.stockGroupName && (
                        <p className="mt-1 text-xs font-bold text-cyan-700">
                          Grup: {item.stockGroupName}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setItems((current) =>
                          current.filter((row) => row.productId !== item.productId),
                        )
                      }
                      aria-label={`Hapus ${item.name}`}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
                    <label className="text-xs font-bold text-slate-600">
                      Jumlah Kebutuhan
                      <div className="relative mt-1">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={item.requestedQty || ""}
                          onChange={(event) =>
                            updateItem(item.productId, {
                              requestedQty: Number(event.target.value),
                            })
                          }
                          className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-12 text-right font-black"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-400">
                          {item.unit}
                        </span>
                      </div>
                    </label>
                    <EditStockMode
                      grouped={Boolean(item.stockGroupId)}
                      value={item.stockMode}
                      onChange={(stockMode) => updateItem(item.productId, { stockMode })}
                    />
                  </div>
                </article>
              ))}
            </div>
          </section>

          <label className="block text-sm font-bold text-slate-700">
            Catatan Internal (Opsional)
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1.5 min-h-[72px] w-full rounded-xl border border-slate-200 p-3 text-sm"
            />
          </label>
          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">
              {error}
            </p>
          )}
          <footer className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={onClose}>
              Tutup
            </Button>
            <Button
              type="button"
              loading={updateRequest.isPending}
              disabled={!canSave}
              onClick={save}
              icon={<PencilLine className="h-4 w-4" />}
            >
              Simpan Perubahan
            </Button>
          </footer>
        </div>
      )}
    </Modal>
  );
}

function EditStockMode({
  grouped,
  value,
  onChange,
}: {
  grouped: boolean;
  value: ShoppingRequestStockMode;
  onChange: (value: ShoppingRequestStockMode) => void;
}) {
  if (!grouped) {
    return (
      <div className="self-end rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
        Stok Produk Ini
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-xs font-bold text-slate-600">Mode stok</p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["GROUP_STOCK", "Stok Bersama"],
            ["PRODUCT_ONLY", "Stok Produk Ini"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`min-h-10 rounded-lg border px-3 text-xs font-black ${
              value === mode
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
