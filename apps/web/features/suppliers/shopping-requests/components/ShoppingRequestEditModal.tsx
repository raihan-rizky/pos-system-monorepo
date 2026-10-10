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
import type { ShoppingRequestDetail } from "../types/shopping-request";
import { ProductAutocomplete } from "./ProductAutocomplete";
import { ShoppingRequestUnitSelect, type ShoppingUnitVariant } from "./ShoppingRequestUnitSelect";
import { chooseUnitVariant } from "../helpers/shopping-request-unit-choice";

interface EditItem {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  imageUrl: string | null;
  stock: number;
  stockGroupName: string | null;
  stockGroupId: string | null;
  requestedQty: number;
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
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<EditItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!fullDetail.data) return;
    setSupplierId(fullDetail.data.supplierId ?? "");
    setName(fullDetail.data.name);
    setNote(fullDetail.data.note ?? "");
    setItems(
      fullDetail.data.items.map((item) => ({
        productId: item.productId,
        name: item.productName,
        sku: item.productSku,
        unit: item.unit ?? "pcs",
        imageUrl: item.imageUrl,
        stock: item.stockOnHand,
        stockGroupName: item.product.stockGroup?.displayName ?? null,
        stockGroupId: item.product.stockGroup?.id ?? null,
        requestedQty: item.requestedQty,
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
              stockGroupName: product.stockGroup?.displayName ?? null,
              stockGroupId: product.stockGroupId ?? product.stockGroup?.id ?? null,
              requestedQty: 1,
            },
            ...current,
          ],
    );
  };

  const updateItem = (
    productId: string,
    patch: Pick<EditItem, "requestedQty">,
  ) =>
    setItems((current) =>
      current.map((item) =>
        item.productId === productId ? { ...item, ...patch } : item,
      ),
    );

  const changeUnit = (productId: string, variant: ShoppingUnitVariant) => {
    try {
      chooseUnitVariant(
        items.map((item) => ({ product: { id: item.productId, unit: item.unit, stockGroupId: item.stockGroupId }, requestedQty: item.requestedQty })),
        productId,
        { id: variant.id, unit: variant.unit, stockGroupId: variant.stockGroupId },
      );
      setItems((current) => current.map((item) => item.productId === productId ? {
        ...item,
        productId: variant.id,
        name: variant.name,
        sku: variant.sku,
        unit: variant.unit,
        imageUrl: variant.imageUrl,
        stock: variant.stock,
        stockGroupId: variant.stockGroupId,
        stockGroupName: variant.stockGroup?.displayName ?? null,
      } : item));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Satuan tidak bisa diganti");
    }
  };

  const save = async () => {
    if (!detail || !supplierId || items.length === 0) return;
    setError(null);
    try {
      await updateRequest.mutateAsync({
        id: detail.id,
        input: {
          supplierId,
          name: name.trim() || undefined,
          note: note || null,
          items: items.map((item) => ({
            productId: item.productId,
            requestedQty: item.requestedQty,
          })),
        },
      });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Gagal memperbarui daftar belanja",
      );
    }
  };

  const canSave =
    Boolean(supplierId) &&
    items.length > 0 &&
    items.every((item) => item.requestedQty > 0);

  return (
    <Modal open={open} onClose={onClose} title="Edit Daftar Belanja" size="6xl">
      {fullDetail.isPending ? (
        <div className="p-8 text-center text-sm font-semibold text-slate-500">
          Memuat detail permohonan...
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-3">
              <SupplierSelector
                value={supplierId}
                onChange={setSupplierId}
                error={!supplierId ? "Supplier wajib dipilih" : null}
              />
              <label className="block text-sm font-bold text-slate-700">
                Nama Daftar Belanja
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={160}
                  className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                />
                <span className="mt-1 block text-xs font-normal text-slate-500">
                  Nama harus unik di toko ini.
                </span>
              </label>
            </div>
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
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className="text-xs font-bold text-slate-600">
                      Jumlah Kebutuhan
                      <input type="number" min="0.01" step="0.01" value={item.requestedQty || ""}
                        onChange={(event) => updateItem(item.productId, { requestedQty: Number(event.target.value) })}
                        className="mt-1 h-10 w-28 rounded-lg border border-slate-200 px-3 text-right font-black" />
                    </label>
                    <ShoppingRequestUnitSelect productId={item.productId} unit={item.unit} stockGroupId={item.stockGroupId} onChange={(variant) => changeUnit(item.productId, variant)} />
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
