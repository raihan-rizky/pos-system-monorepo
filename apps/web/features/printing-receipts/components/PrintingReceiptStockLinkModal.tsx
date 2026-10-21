"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Input, Modal } from "@pos/ui";
import { Search } from "lucide-react";
import { useProductsPage, type Product } from "@/hooks/useProducts";
import { useRole } from "@/components/providers/RoleProvider";
import type { PrintingReceiptLine } from "../types";

interface StockChoice { id: string; name: string; unit: string; stock: number }

export function PrintingReceiptStockLinkModal({ line, onClose, onSave, inline = false }: {
  line: PrintingReceiptLine;
  onClose: () => void;
  onSave: (stockLink: PrintingReceiptLine["stockLink"]) => void;
  /** Keep controls within a native dialog's focus boundary. */
  inline?: boolean;
}) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<StockChoice | null>(null);
  const [quantity, setQuantity] = useState<string>(String(line.stockLink?.quantity ?? 1));
  const products = useProductsPage(search, "", { page, limit: 12, inStockOnly: false });
  const currentProduct = useQuery({
    queryKey: ["products", "receipt-stock-link", userId, storeId, authorizationFingerprint, line.stockLink?.productId], enabled: Boolean(line.stockLink?.productId),
    queryFn: async () => {
      const response = await fetch(`/api/products/${encodeURIComponent(line.stockLink!.productId)}`);
      if (!response.ok) throw new Error("Bahan stok sebelumnya tidak ditemukan. Pilih bahan lain atau lepaskan hubungan stok.");
      const payload = await response.json() as { data: Product };
      return payload.data;
    },
  });
  const choices = useMemo(() => {
    const seen = new Set<string>();
    return (products.data?.data ?? []).flatMap(product => [
      { id: product.id, name: product.name, unit: product.unit, stock: product.stock },
      ...(product.variants ?? []).map(variant => ({ id: variant.id, name: product.name, unit: variant.unit, stock: variant.stock })),
    ]).filter(choice => { if (seen.has(choice.id)) return false; seen.add(choice.id); return true; });
  }, [products.data]);
  const existing = currentProduct.data ? { id: currentProduct.data.id, name: currentProduct.data.name, unit: currentProduct.data.unit, stock: currentProduct.data.stock } : null;
  const active = selected ?? existing;
  const consumption = Number(quantity);
  const valid = Boolean(active) && Number.isFinite(consumption) && consumption > 0;

  const content = <div className="space-y-4">
      <p className="text-sm text-surface-600">Pilih produk atau bahan yang benar-benar dipakai. Stok berkurang setelah nota menjadi transaksi. Jumlah pemakaian adalah total untuk baris ini.</p>
      <Input label="Cari produk atau bahan stok" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} icon={<Search size={16} />} />
      <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-surface-200 p-2" role="group" aria-label="Pilihan bahan stok">
        {products.isLoading ? <p role="status" className="p-3 text-sm text-surface-500">Memuat katalog stok...</p> : null}
        {products.isError ? <div role="alert" className="p-3 text-sm text-danger-700">Katalog belum bisa dimuat. <button className="underline" onClick={() => void products.refetch()}>Coba lagi</button></div> : null}
        {!products.isLoading && !products.isError && !choices.length ? <p className="p-3 text-sm text-surface-500">Bahan tidak ditemukan. Coba nama atau SKU lain.</p> : null}
        {choices.map(choice => <button type="button" key={choice.id} aria-pressed={active?.id === choice.id} onClick={() => setSelected(choice)}
          className={`flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${active?.id === choice.id ? "border-brand-400 bg-brand-50" : "border-transparent hover:bg-surface-50"}`}>
          <span><span className="block font-semibold">{choice.name}</span><span className="text-xs text-surface-500">Satuan {choice.unit}</span></span>
          <span className="shrink-0 text-xs text-surface-600">Stok {choice.stock} {choice.unit}</span>
        </button>)}
      </div>
      {(products.data?.pagination.totalPages ?? 1) > 1 && <div className="flex items-center justify-between text-sm">
        <Button size="sm" variant="ghost" disabled={page <= 1 || products.isFetching} onClick={() => setPage(value => value - 1)}>Sebelumnya</Button>
        <span>Halaman {page} / {products.data?.pagination.totalPages}</span>
        <Button size="sm" variant="ghost" disabled={!products.data?.pagination.hasNextPage || products.isFetching} onClick={() => setPage(value => value + 1)}>Berikutnya</Button>
      </div>}
      {currentProduct.isError && !selected ? <p role="alert" className="text-sm text-danger-700">{currentProduct.error.message}</p> : null}
      <div className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm">
        <p className="font-semibold">{active ? active.name : "Belum ada bahan terpilih"}</p>
        <p className="mt-1 text-surface-600">{active ? `Satuan pemakaian: ${active.unit}` : "Pilih dari daftar katalog di atas."}</p>
        <div className="mt-3"><Input label={`Jumlah pemakaian${active ? ` (${active.unit})` : ""}`} type="number" min="0.000001" step="any" value={quantity} onChange={event => setQuantity(event.target.value)} /></div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {line.stockLink && <Button variant="ghost" onClick={() => { onSave(null); onClose(); }}>Lepaskan stok</Button>}
        <Button variant="secondary" onClick={onClose}>Batal</Button>
        <Button disabled={!valid} onClick={() => { if (active && valid) { onSave({ productId: active.id, quantity: consumption, unit: active.unit }); onClose(); } }}>Simpan hubungan</Button>
      </div>
    </div>;
  const title = `Hubungkan stok · ${line.name || "Baris nota"}`;
  return inline ? <section aria-label={title} className="space-y-4 p-4"><h3 className="font-bold text-surface-900">{title}</h3>{content}</section>
    : <Modal open onClose={onClose} title={title} size="lg">{content}</Modal>;
}
