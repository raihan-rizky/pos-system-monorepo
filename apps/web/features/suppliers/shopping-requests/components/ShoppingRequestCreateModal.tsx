"use client";

import React, { useState } from "react";
import { ShoppingCart, Trash2, Box } from "lucide-react";
import { Button, Modal } from "@pos/ui";

import type { Product } from "@/hooks/useProducts";
import { useSuppliers } from "@/features/suppliers/hooks/useSuppliers";
import { useCreateShoppingRequest } from "../hooks/useShoppingRequests";
import { ProductAutocomplete } from "./ProductAutocomplete";

interface CartItem {
  product: Product;
  requestedQty: number;
}

export function ShoppingRequestCreateModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [note, setNote] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  
  const suppliers = useSuppliers({ isActive: true, limit: 100 });
  const createRequest = useCreateShoppingRequest();

  const canSave = cartItems.length > 0 && cartItems.every((item) => item.requestedQty > 0);

  const reset = () => {
    setSupplierId("");
    setNote("");
    setCartItems([]);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleProductSelect = (product: Product) => {
    setCartItems((prev) => {
      // Avoid duplicate, just focus or slightly increase if already exists
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev;
      }
      return [{ product, requestedQty: 1 }, ...prev];
    });
  };

  const handleUpdateQty = (productId: string, qty: number) => {
    setCartItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, requestedQty: qty } : item,
      ),
    );
  };

  const handleRemoveItem = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const save = async () => {
    await createRequest.mutateAsync({
      supplierId: supplierId || null,
      note: note || null,
      items: cartItems.map((item) => ({
        productId: item.product.id,
        requestedQty: item.requestedQty,
      })),
    });
    close();
  };

  return (
    <Modal open={open} onClose={close} title="Buat Daftar Belanja" size="4xl">
      <div className="flex flex-col gap-6">
        {/* Top Controls Section */}
        <section className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">
              Supplier Tujuan (Opsional)
            </span>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 cursor-pointer"
            >
              <option value="">Belum ditentukan</option>
              {(suppliers.data?.data ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <div className="block z-50">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">
              Cari & Tambah Produk
            </span>
            <ProductAutocomplete onSelect={handleProductSelect} />
          </div>
        </section>

        {/* Cart List Section */}
        <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
            <ShoppingCart className="h-5 w-5 text-brand-600" />
            <h3 className="font-bold text-slate-900">
              Daftar Barang ({cartItems.length})
            </h3>
          </div>

          <div className="max-h-[45vh] overflow-y-auto p-3">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <Box className="mb-3 h-10 w-10 opacity-50" />
                <p className="text-sm font-semibold">Belum ada barang dipilih</p>
                <p className="text-xs">Gunakan kotak pencarian di atas untuk menambah barang.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {cartItems.map((item) => (
                  <article
                    key={item.product.id}
                    className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-all sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-slate-900">
                        {item.product.name}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-semibold text-slate-700">{item.product.sku}</span>
                        <span>&bull;</span>
                        <span>Sisa Gudang: {item.product.stock} {item.product.unit}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                          Kebutuhan:
                        </span>
                        <div className="relative">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.requestedQty || ""}
                            onChange={(e) =>
                              handleUpdateQty(item.product.id, Number(e.target.value))
                            }
                            className="min-h-11 w-28 rounded-xl border border-slate-200 px-3 pr-10 text-sm font-semibold focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                            aria-label={`Jumlah pesanan untuk ${item.product.name}`}
                          />
                          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">
                            {item.product.unit}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.product.id)}
                        className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-xl text-slate-400 transition-colors duration-200 hover:bg-red-50 hover:text-red-600 focus:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                        title="Hapus barang"
                        aria-label={`Hapus ${item.product.name} dari daftar`}
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">
              Catatan Internal (Opsional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[80px] w-full rounded-xl border border-slate-200 p-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
              placeholder="Tambahkan catatan untuk reviewer..."
            />
          </label>
        </section>

        <footer className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={close}>
            Tutup
          </Button>
          <Button
            type="button"
            loading={createRequest.isPending}
            disabled={!canSave}
            onClick={save}
          >
            Simpan Draft Belanja
          </Button>
        </footer>
      </div>
    </Modal>
  );
}
