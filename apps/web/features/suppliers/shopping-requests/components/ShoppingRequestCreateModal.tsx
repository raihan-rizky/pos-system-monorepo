"use client";

import React, { useEffect, useState } from "react";
import { Box, ShoppingCart, Trash2 } from "lucide-react";
import { Button, Modal } from "@pos/ui";

import type { Product } from "@/hooks/useProducts";
import { SupplierSelector } from "@/features/suppliers/components/SupplierSelector";
import { ProductStockThumbnail } from "@/features/inventory-management/components/ProductStockThumbnail";
import { useCreateShoppingRequest } from "../hooks/useShoppingRequests";
import { defaultShoppingRequestStockMode } from "../helpers/shopping-requests-core";
import { previewShoppingRequestStock } from "../api/shopping-requests-api";
import type { ShoppingRequestStockPreview } from "../helpers/shopping-request-stock";
import type { ShoppingRequestStockMode } from "../types/shopping-request";
import { ProductAutocomplete } from "./ProductAutocomplete";
import { ShoppingRequestStockPreviewPanel } from "./ShoppingRequestStockPreview";

interface CartItem {
  product: Product;
  requestedQty: number;
  stockMode: ShoppingRequestStockMode;
}

export function ShoppingRequestCreateModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [supplierId, setSupplierId] = useState("");
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [preview, setPreview] = useState<ShoppingRequestStockPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const createRequest = useCreateShoppingRequest();

  const canSave = Boolean(supplierId) && cartItems.length > 0 && cartItems.every((item) => item.requestedQty > 0);

  useEffect(() => {
    if (!open || cartItems.length === 0 || cartItems.some((item) => item.requestedQty <= 0)) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setIsPreviewing(true);
      previewShoppingRequestStock(cartItems.map((item) => ({
        itemId: item.product.id,
        productId: item.product.id,
        stockMode: item.stockMode,
        quantity: item.requestedQty,
      })))
        .then((data) => {
          if (!cancelled) { setPreview(data); setPreviewError(null); }
        })
        .catch((error) => {
          if (!cancelled) { setPreview(null); setPreviewError(error instanceof Error ? error.message : "Gagal membuat preview stok"); }
        })
        .finally(() => { if (!cancelled) setIsPreviewing(false); });
    }, 300);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [cartItems, open]);

  const reset = () => {
    setSupplierId(""); setSupplierError(null); setNote(""); setCartItems([]);
    setPreview(null); setPreviewError(null);
  };
  const close = () => { reset(); onClose(); };

  const handleProductSelect = (product: Product) => {
    setCartItems((current) => current.some((item) => item.product.id === product.id)
      ? current
      : [{ product, requestedQty: 1, stockMode: defaultShoppingRequestStockMode(product.stockGroupId ?? product.stockGroup?.id) }, ...current]);
  };

  const updateItem = (productId: string, patch: Partial<Pick<CartItem, "requestedQty" | "stockMode">>) => {
    setCartItems((current) => current.map((item) => item.product.id === productId ? { ...item, ...patch } : item));
  };

  const save = async () => {
    if (!supplierId) { setSupplierError("Pilih supplier tujuan terlebih dahulu."); return; }
    await createRequest.mutateAsync({
      supplierId,
      note: note || null,
      items: cartItems.map((item) => ({ productId: item.product.id, requestedQty: item.requestedQty, stockMode: item.stockMode })),
    });
    close();
  };

  return (
    <Modal open={open} onClose={close} title="Buat Daftar Belanja" size="6xl">
      <div className="flex flex-col gap-5">
        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <SupplierSelector value={supplierId} onChange={(value) => { setSupplierId(value); setSupplierError(null); }} error={supplierError} />
          <div className="z-50 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="mb-1.5 block text-sm font-bold text-slate-700">Cari & Tambah Produk</span>
            <ProductAutocomplete onSelect={handleProductSelect} />
            <p className="mt-2 text-xs text-slate-500">Foto, stok terkini, unit, dan grup stok ditampilkan agar produk mudah dikenali.</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
            <h3 className="flex items-center gap-2 font-bold text-slate-900"><ShoppingCart className="h-5 w-5 text-brand-600" />Daftar Barang ({cartItems.length})</h3>
            <span className="text-xs font-semibold text-slate-500">Mode default: Stok Bersama</span>
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
                    <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
                      <label className="text-xs font-bold text-slate-600">Kebutuhan
                        <div className="relative mt-1"><input type="number" min="0.01" step="0.01" value={item.requestedQty || ""} onChange={(event) => updateItem(item.product.id, { requestedQty: Number(event.target.value) })} className="h-10 w-full rounded-lg border border-slate-200 px-3 pr-14 text-right font-bold" /><span className="absolute right-3 top-2.5 text-xs text-slate-400">{item.product.unit}</span></div>
                      </label>
                      <StockModeSelector product={item.product} value={item.stockMode} onChange={(stockMode) => updateItem(item.product.id, { stockMode })} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>

        <ShoppingRequestStockPreviewPanel preview={preview} loading={isPreviewing} error={previewError} />
        <label className="block text-sm font-bold text-slate-700">Catatan Internal (Opsional)<textarea value={note} onChange={(event) => setNote(event.target.value)} className="mt-1.5 min-h-[72px] w-full rounded-xl border border-slate-200 p-3 text-sm" placeholder="Tambahkan catatan untuk reviewer..." /></label>
        <footer className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold text-slate-500">Stok belum berubah sampai daftar belanja disetujui.</p>
          <div className="flex gap-2"><Button type="button" variant="secondary" onClick={close}>Tutup</Button><Button type="button" loading={createRequest.isPending} disabled={!canSave || isPreviewing} onClick={save}>Simpan Daftar Belanja</Button></div>
        </footer>
      </div>
    </Modal>
  );
}

function StockModeSelector({ product, value, onChange }: { product: Product; value: ShoppingRequestStockMode; onChange: (value: ShoppingRequestStockMode) => void }) {
  const grouped = Boolean(product.stockGroupId ?? product.stockGroup?.id);
  if (!grouped) return <div className="self-end rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">Stok Produk Ini</div>;
  return <div><p className="mb-1 text-xs font-bold text-slate-600">Mode stok</p><div className="grid grid-cols-2 gap-2">{([['GROUP_STOCK','Stok Bersama'],['PRODUCT_ONLY','Stok Produk Ini']] as const).map(([mode,label]) => <button key={mode} type="button" onClick={() => onChange(mode)} className={`min-h-10 rounded-lg border px-3 text-xs font-black ${value === mode ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{label}</button>)}</div></div>;
}
