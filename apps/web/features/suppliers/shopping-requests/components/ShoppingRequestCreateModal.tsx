"use client";

import React, { useState } from "react";
import { Box, ShoppingCart, Trash2 } from "lucide-react";
import { Button, Modal } from "@pos/ui";

import type { Product } from "@/hooks/useProducts";
import { SupplierSelector } from "@/features/suppliers/components/SupplierSelector";
import { ProductStockThumbnail } from "@/features/inventory-management/components/ProductStockThumbnail";
import { useCreateShoppingRequest } from "../hooks/useShoppingRequests";
import { ProductAutocomplete } from "./ProductAutocomplete";
import { ShoppingRequestUnitSelect, type ShoppingUnitVariant } from "./ShoppingRequestUnitSelect";
import { chooseUnitVariant } from "../helpers/shopping-request-unit-choice";

interface CartItem {
  product: Product;
  requestedQty: number;
}

export function ShoppingRequestCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [supplierId, setSupplierId] = useState("");
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const createRequest = useCreateShoppingRequest();

  const canSave = Boolean(supplierId) && cartItems.length > 0 && cartItems.every((item) => item.requestedQty > 0);

  const reset = () => {
    setSupplierId(""); setSupplierError(null); setName(""); setError(null); setNote(""); setCartItems([]);
  };
  const close = () => { reset(); onClose(); };

  const handleProductSelect = (product: Product) => {
    setCartItems((current) => current.some((item) => item.product.id === product.id)
      ? current
      : [{ product, requestedQty: 1 }, ...current]);
  };

  const updateItem = (productId: string, patch: Pick<CartItem, "requestedQty">) => {
    setCartItems((current) => current.map((item) => item.product.id === productId ? { ...item, ...patch } : item));
  };

  const changeUnit = (productId: string, variant: ShoppingUnitVariant) => {
    try {
      const selected = cartItems.find((item) => item.product.id === productId);
      if (!selected) return;
      const product: Product = {
        ...selected.product,
        ...variant,
        stockGroup: variant.stockGroup ? { ...variant.stockGroup, baseUnit: variant.stockGroup.baseUnit ?? "" } : null,
      };
      setCartItems(chooseUnitVariant(cartItems, productId, product));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Satuan tidak bisa diganti");
    }
  };

  const save = async () => {
    if (!supplierId) { setSupplierError("Pilih supplier tujuan terlebih dahulu."); return; }
    setError(null);
    try {
      await createRequest.mutateAsync({
        supplierId,
        name: name.trim() || undefined,
        note: note || null,
        items: cartItems.map((item) => ({ productId: item.product.id, requestedQty: item.requestedQty })),
      });
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyimpan daftar belanja");
    }
  };

  return (
    <Modal open={open} onClose={close} title="Buat Daftar Belanja" size="6xl">
      <div className="flex flex-col gap-5">
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <SupplierSelector value={supplierId} onChange={(value) => { setSupplierId(value); setSupplierError(null); }} error={supplierError} />
            <label className="block text-sm font-bold text-slate-700">
              Nama Daftar Belanja (Opsional)
              <input
                value={name}
                onChange={(event) => { setName(event.target.value); setError(null); }}
                maxLength={160}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-medium outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100"
                placeholder="Kosongkan untuk memakai nomor dokumen"
              />
              <span className="mt-1 block text-xs font-normal text-slate-500">
                Nama harus unik di toko ini. Nomor dokumen dibuat otomatis saat disimpan.
              </span>
            </label>
          </div>
          <div className="z-50 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">Cari & Tambah Produk</span>
            <ProductAutocomplete onSelect={handleProductSelect} />
            <p className="mt-2 text-xs text-slate-500">Foto, stok terkini, unit, dan grup stok ditampilkan agar produk mudah dikenali.</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
            <h3 className="flex items-center gap-2 font-bold text-slate-900"><ShoppingCart className="h-5 w-5 text-brand-600" />Daftar Barang ({cartItems.length})</h3>
          </div>
          <div className="max-h-[42vh] overflow-y-auto p-3">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400"><Box className="mb-3 h-10 w-10 opacity-50" /><p className="text-sm font-semibold">Belum ada barang dipilih</p></div>
            ) : (
              <div className="grid gap-3">
                {cartItems.map((item) => (
                  <article key={item.product.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <ProductStockThumbnail name={item.product.name} imageUrl={item.product.imageUrl} categoryName={item.product.category?.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-black text-slate-900">{item.product.name}</p>
                        <p className="text-xs font-semibold text-slate-500">{item.product.sku} · Stok {item.product.stock} {item.product.unit}</p>
                        {item.product.stockGroup && <p className="mt-1 text-xs font-bold text-cyan-700">Grup: {item.product.stockGroup.displayName}</p>}
                      </div>
                      <button type="button" onClick={() => setCartItems((current) => current.filter((row) => row.product.id !== item.product.id))} aria-label={`Hapus ${item.product.name}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-5 w-5" /></button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="text-xs font-bold text-slate-600">Kebutuhan
                        <input type="number" min="0.01" step="0.01" value={item.requestedQty || ""} onChange={(event) => updateItem(item.product.id, { requestedQty: Number(event.target.value) })} className="mt-1 h-10 w-28 rounded-lg border border-slate-200 px-3 text-right font-bold" />
                      </label>
                      <ShoppingRequestUnitSelect productId={item.product.id} unit={item.product.unit} stockGroupId={item.product.stockGroupId ?? item.product.stockGroup?.id} onChange={(variant) => changeUnit(item.product.id, variant)} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <label className="block text-sm font-bold text-slate-700">Catatan Internal (Opsional)<textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-1.5 min-h-[72px] w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Tambahkan catatan untuk reviewer..." /></label>
        {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-500">Daftar belanja dan approval tidak mengubah stok.</p>
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={close}>Tutup</Button><Button type="button" loading={createRequest.isPending} disabled={!canSave} onClick={save}>Simpan Daftar Belanja</Button></div>
        </footer>
      </div>
    </Modal>
  );
}
