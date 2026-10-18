"use client";

import { useEffect, useState } from "react";
import { CategoryRequestError, useCategoryManagement } from "../hooks/useCategoryManagement";
import type { DeletePreview, ManagedCategory } from "../types";
import { buttonClass, CategoryDialog, dangerClass, fieldClass } from "./CategoryDialog";

export function canConfirmCategoryDelete(preview: DeletePreview | null, acknowledged: boolean, confirmation: string, busy: boolean) {
  return !!preview && preview.expiresAt > Date.now() && !busy && acknowledged && confirmation === `HAPUS ${preview.totals.categories} KATEGORI` && preview.categories.every(category => category.products === 0 || !!category.targetCategoryId);
}

export function CategoryDeleteImpact({ preview }: { preview: DeletePreview }) {
  const { totals } = preview;
  return <div className="space-y-4">
    <section className="space-y-2 rounded-xl border border-red-300 bg-red-50 p-4 text-red-900">
      <h3 className="font-bold">Perhatian: perubahan ini memengaruhi produk dan harga pelanggan</h3>
      <p className="text-sm">Anda akan menghapus {totals.categories} kategori, memindahkan {totals.products} produk, dan menghapus {totals.rules} aturan harga pelanggan di {totals.stores} toko.</p>
      <p className="text-sm">Produk mencakup {totals.activeProducts} aktif dan {totals.inactiveProducts} nonaktif. Semua aturan aktif maupun nonaktif kategori asal ikut dihapus. Kategori dan aturan harga yang dihapus tidak dapat dipulihkan melalui fitur ini.</p>
      <p className="text-sm">Harga pelanggan dan pengelompokan penjualan dapat berubah mengikuti kategori tujuan. Aturan asal tidak disalin ke tujuan.</p>
    </section>
    {preview.categories.map(category => <section key={category.id} className="space-y-2 rounded-xl border border-slate-200 p-4">
      <h3 className="font-bold break-words">{category.name}</h3>
      <p className="text-sm">{category.products} produk ({category.activeProducts} aktif, {category.inactiveProducts} nonaktif). Tujuan: {category.targetCategoryName ?? (category.products ? "Belum dipilih" : "Tidak diperlukan")}.</p>
      <p className="text-sm font-medium">{category.rules.length} aturan dihapus ({category.rules.filter(rule => rule.isActive).length} aktif, {category.rules.filter(rule => !rule.isActive).length} nonaktif)</p>
      <h4 className="text-sm font-bold">Dampak toko untuk {category.name}</h4>
      <ul className="space-y-1 text-sm">{category.stores.map(store => <li key={store.id} className="break-words">{store.name}: {store.products} produk, {store.rules} aturan</li>)}</ul>
      {category.rules.length > 0 && <ul className="space-y-2 text-sm">{category.rules.map(rule => <li key={rule.id} className="rounded-lg bg-slate-50 p-3 break-words">
        <p className="font-medium">{rule.storeName}: {rule.customerTypes.join(", ")}</p>
        <p>Unit: {rule.unit ?? "Semua unit"}; merek: {rule.brandName ?? "Semua merek"}</p>
        <p>{rule.mode}: {rule.value}. {rule.isActive ? "Aktif" : "Nonaktif"}</p>
      </li>)}</ul>}
    </section>)}
    <section className="space-y-2 text-sm"><h3 className="font-bold">Toko terdampak, seluruh toko</h3><ul className="space-y-1">{preview.stores.map(store => <li key={store.id} className="break-words">{store.name}: {store.products} produk, {store.rules} aturan</li>)}</ul>{preview.stores.length === 0 && <p>Tidak ada produk atau aturan harga yang terdampak.</p>}</section>
  </div>;
}

export function CategoryDeleteDialog({ categories, selectedIds, canMove, onClose, onDeleted }: {
  categories: ManagedCategory[]; selectedIds: string[]; canMove: boolean; onClose: () => void; onDeleted: (ids: string[], message: string) => void;
}) {
  const [ids] = useState(() => [...selectedIds]);
  const [destinations, setDestinations] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<DeletePreview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<unknown>(null);
  const mutation = useCategoryManagement();
  const selected = categories.filter(category => ids.includes(category.id));
  const targets = categories.filter(category => !ids.includes(category.id));
  function resetPreview() { setPreview(null); setAcknowledged(false); setConfirmation(""); }
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => { setPreview(null); setAcknowledged(false); setConfirmation(""); setError(new Error("Pratinjau kedaluwarsa. Tinjau ulang dampak sebelum menghapus kategori.")); }, Math.max(0, preview.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [preview]);
  async function inspect() {
    resetPreview(); setError(null);
    try { setPreview(await mutation.execute<DeletePreview>({ action: "preview-delete", categoryIds: ids, destinations })); }
    catch (cause) { setError(cause); }
  }
  async function remove() {
    if (!canConfirmCategoryDelete(preview, acknowledged, confirmation, mutation.isPending)) return;
    setError(null);
    try {
      const result = await mutation.execute({ action: "delete", categoryIds: ids, destinations, token: preview!.token, acknowledged, confirmation });
      onDeleted(ids, result.message);
    } catch (cause) {
      if (cause instanceof CategoryRequestError && cause.status === 409) resetPreview();
      setError(cause);
    }
  }
  const requiresUpdate = !!preview?.totals.products && !canMove;
  return <CategoryDialog title={`Hapus ${ids.length} Kategori`} onClose={onClose} busy={mutation.isPending} error={error}>
    <p className="text-sm text-slate-600">Kategori dipakai bersama oleh seluruh toko. Tinjau produk dan aturan harga di semua toko sebelum melanjutkan.</p>
    <fieldset disabled={mutation.isPending} className="space-y-3">
      <legend className="mb-2 font-bold">Tujuan produk per kategori asal</legend>
      {selected.map(category => <label key={category.id} className="block space-y-1 text-sm font-medium">Tujuan untuk {category.name}
        <select className={fieldClass} value={destinations[category.id] ?? ""} onChange={event => { const target = event.target.value; setDestinations(current => { const next = { ...current }; if (target) next[category.id] = target; else delete next[category.id]; return next; }); resetPreview(); setError(null); }}>
          <option value="">Pilih tujuan jika ada produk</option>{targets.map(target => <option key={target.id} value={target.id}>{target.name}</option>)}
        </select>
      </label>)}
    </fieldset>
    <button type="button" className={buttonClass} disabled={mutation.isPending} onClick={inspect}>{mutation.isPending ? "Memproses..." : preview ? "Muat Ulang Dampak" : "Tinjau Dampak Seluruh Toko"}</button>
    {preview && <>
      <CategoryDeleteImpact preview={preview} />
      {requiresUpdate && <p role="alert" className="text-sm text-red-700">Pemindahan produk membutuhkan izin mengubah produk. Hubungi pemilik toko.</p>}
      {preview.categories.some(category => category.products > 0 && !category.targetCategoryId) && <p className="text-sm font-medium text-red-700">Pilih tujuan untuk setiap kategori yang berisi produk, lalu tinjau ulang dampaknya.</p>}
      <label className="flex min-h-11 items-start gap-3 text-sm"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" disabled={mutation.isPending} checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /><span>Saya memahami dampak pemindahan produk dan penghapusan aturan harga ini</span></label>
      <label className="block space-y-1 text-sm font-medium">Ketik HAPUS {preview.totals.categories} KATEGORI<input className={fieldClass} autoComplete="off" spellCheck={false} disabled={mutation.isPending} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
    </>}
    <div className="flex flex-wrap justify-end gap-2"><button type="button" className={buttonClass} disabled={mutation.isPending} onClick={onClose}>Batal</button><button type="button" className={dangerClass} disabled={requiresUpdate || !canConfirmCategoryDelete(preview, acknowledged, confirmation, mutation.isPending)} onClick={remove}>{mutation.isPending ? "Memproses..." : preview?.totals.products ? "Pindahkan Produk dan Hapus Kategori" : "Hapus Kategori"}</button></div>
  </CategoryDialog>;
}
