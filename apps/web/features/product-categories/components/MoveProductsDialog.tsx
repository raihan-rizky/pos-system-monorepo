"use client";

import { useEffect, useState } from "react";
import { CategoryRequestError, useCategoryManagement, useManagedCategories } from "../hooks/useCategoryManagement";
import type { MovePreview } from "../types";
import { buttonClass, CategoryDialog, fieldClass, primaryClass } from "./CategoryDialog";

export function MoveProductsImpact({ preview }: { preview: MovePreview }) {
  return <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
    <h3 className="font-bold">Tinjau pemindahan ke {preview.targetCategoryName}</h3>
    <p>{preview.totals.products} produk akan dipindahkan. {preview.totals.unchanged} produk sudah di tujuan dan tidak perlu dipindah.</p>
    <ul className="space-y-1">{preview.origins.map(origin => <li key={origin.id} className="break-words">Asal {origin.name}: {origin.products} produk</li>)}</ul>
    <p>Aturan harga pelanggan dan kelompok penjualan mengikuti kategori tujuan. Harga pelanggan dapat berubah. Stok, unit, dan harga dasar produk tetap tersimpan.</p>
  </div>;
}

export function MoveProductsDialog({ productIds, onClose, onMoved }: { productIds: string[]; onClose: () => void; onMoved: (message: string) => void }) {
  const [ids] = useState(() => [...new Set(productIds)]);
  const categoriesQuery = useManagedCategories();
  const mutation = useCategoryManagement();
  const [targetCategoryId, setTargetCategoryId] = useState("");
  const [preview, setPreview] = useState<MovePreview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => { setPreview(null); setAcknowledged(false); setError(new Error("Pratinjau kedaluwarsa. Tinjau ulang produk sebelum memindahkannya.")); }, Math.max(0, preview.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [preview]);
  async function inspect() {
    setError(null); setPreview(null); setAcknowledged(false);
    try { setPreview(await mutation.execute<MovePreview>({ action: "preview-move", productIds: ids, targetCategoryId })); }
    catch (cause) { setError(cause); }
  }
  async function move() {
    if (!preview || preview.expiresAt <= Date.now() || !acknowledged || mutation.isPending) return;
    setError(null);
    try {
      const result = await mutation.execute({ action: "move", productIds: ids, targetCategoryId, token: preview.token, acknowledged });
      onMoved(`${result.message} ${result.unchangedProducts ?? 0} produk sudah di tujuan.`);
    } catch (cause) {
      if (cause instanceof CategoryRequestError && cause.status === 409) { setPreview(null); setAcknowledged(false); }
      setError(cause);
    }
  }
  return <CategoryDialog title={`Pindahkan Kategori ${ids.length} Produk`} onClose={onClose} busy={mutation.isPending} error={error}>
    <p className="text-sm text-slate-600">Pemindahan hanya berlaku untuk {ids.length} ID produk yang Anda pilih, termasuk pilihan dari halaman lain.</p>
    {categoriesQuery.isPending ? <p role="status">Memuat kategori...</p> : categoriesQuery.isError ? <div role="alert"><p>Daftar kategori belum bisa dimuat.</p><button type="button" className={buttonClass} onClick={() => categoriesQuery.refetch()}>Coba Lagi</button></div> : <label className="block space-y-1 text-sm font-medium">Kategori tujuan<select className={fieldClass} disabled={mutation.isPending} value={targetCategoryId} onChange={event => { setTargetCategoryId(event.target.value); setPreview(null); setAcknowledged(false); setError(null); }}><option value="">Pilih kategori tujuan</option>{categoriesQuery.data?.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
    <button type="button" className={buttonClass} disabled={!targetCategoryId || mutation.isPending || categoriesQuery.isError} onClick={inspect}>{mutation.isPending ? "Memproses..." : "Tinjau Pemindahan"}</button>
    {preview && <><MoveProductsImpact preview={preview} /><label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={acknowledged} disabled={mutation.isPending} onChange={event => setAcknowledged(event.target.checked)} /><span>Saya memahami bahwa harga pelanggan dapat berubah mengikuti kategori tujuan</span></label></>}
    <div className="flex flex-wrap justify-end gap-2"><button type="button" className={buttonClass} disabled={mutation.isPending} onClick={onClose}>Batal</button><button type="button" className={primaryClass} disabled={!preview || preview.expiresAt <= Date.now() || !acknowledged || mutation.isPending} onClick={move}>{mutation.isPending ? "Memproses..." : "Pindahkan Produk"}</button></div>
  </CategoryDialog>;
}
