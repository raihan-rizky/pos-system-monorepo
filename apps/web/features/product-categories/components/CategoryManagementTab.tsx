"use client";

import { useRef, useState, useEffect } from "react";
import { CategoryIcon } from "@/lib/category-icons";
import { useManagedCategories } from "../hooks/useCategoryManagement";
import { CategoryEditor } from "./CategoryEditor";
import { CategoryDeleteDialog } from "./CategoryDeleteDialog";
import { buttonClass, fieldClass, primaryClass } from "./CategoryDialog";

export function selectVisibleCategories(selected: Set<string>, visibleIds: string[], checked: boolean) {
  const next = new Set(selected);
  for (const id of visibleIds) { if (checked) next.add(id); else next.delete(id); }
  return next;
}

export function CategoryManagementTab({ canCreate, canUpdate, canDelete, onDeleted }: {
  canCreate: boolean; canUpdate: boolean; canDelete: boolean; onDeleted: (ids: string[]) => void;
}) {
  const query = useManagedCategories();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editor, setEditor] = useState<"create" | "update" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const categories = query.data ?? [];
  const visible = categories.filter(category => category.name.toLocaleLowerCase("id").includes(search.trim().toLocaleLowerCase("id")));
  const selectedCategories = categories.filter(category => selected.has(category.id));
  const allVisible = visible.length > 0 && visible.every(category => selected.has(category.id));
  const someVisible = visible.some(category => selected.has(category.id));
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (selectAllRef.current) selectAllRef.current.indeterminate = someVisible && !allVisible; }, [someVisible, allVisible]);
  function saved(text: string) { setMessage(text); setEditor(null); setSelected(new Set()); }
  return <section className="space-y-5" aria-label="Pengelolaan kategori produk">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900">Kategori Produk</h2><p className="mt-1 text-sm text-slate-600">Kategori digunakan bersama oleh seluruh toko.</p></div>{canCreate && <button type="button" className={primaryClass} onClick={() => setEditor("create")}>Tambah Kategori</button>}</div>
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}
    <label className="block max-w-md space-y-1 text-sm font-medium">Cari kategori<input className={fieldClass} value={search} onChange={event => setSearch(event.target.value)} placeholder="Nama kategori" /></label>
    {query.isPending ? <p role="status">Memuat kategori...</p> : query.isError ? <div role="alert" className="space-y-2 text-sm text-red-700"><p>Daftar kategori belum bisa dimuat. Periksa koneksi lalu coba lagi.</p><button type="button" className={buttonClass} onClick={() => query.refetch()}>Coba Lagi</button></div> : <>
      {(canUpdate || canDelete) && <div className="flex flex-wrap items-center gap-2"><p className="mr-2 text-sm text-slate-700">{selectedCategories.length} kategori dipilih ({visible.filter(category => selected.has(category.id)).length} terlihat)</p>{canUpdate && <button type="button" className={buttonClass} disabled={!selectedCategories.length} onClick={() => setEditor("update")}>Ubah Pilihan</button>}{canDelete && <button type="button" className={`${buttonClass} text-red-700`} disabled={!selectedCategories.length} onClick={() => setDeleting(true)}>Hapus Pilihan</button>}{selected.size > 0 && <button type="button" className={buttonClass} onClick={() => setSelected(new Set())}>Bersihkan Pilihan</button>}</div>}
      {visible.length === 0 ? <p className="py-8 text-center text-sm text-slate-600">{categories.length ? "Tidak ada kategori yang cocok dengan pencarian." : "Belum ada kategori. Tambahkan kategori pertama untuk mengelompokkan produk."}</p> : <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left text-sm"><caption className="sr-only">Daftar kategori produk, {visible.length} kategori terlihat</caption><thead className="bg-slate-50 text-slate-600"><tr>{(canUpdate || canDelete) && <th className="p-3"><input ref={selectAllRef} className="h-5 w-5" type="checkbox" aria-label="Pilih semua kategori yang terlihat" checked={allVisible} onChange={event => setSelected(current => selectVisibleCategories(current, visible.map(category => category.id), event.target.checked))} /></th>}<th className="p-3">Kategori</th><th className="p-3">Urutan</th><th className="p-3">Kelompok penjualan</th><th className="p-3">Produk</th></tr></thead><tbody className="divide-y divide-slate-200">{visible.map(category => <tr key={category.id} className="text-slate-800">{(canUpdate || canDelete) && <td className="p-3"><label className="flex min-h-11 items-center"><input type="checkbox" className="h-5 w-5" aria-label={`Pilih ${category.name}`} checked={selected.has(category.id)} onChange={event => setSelected(current => selectVisibleCategories(current, [category.id], event.target.checked))} /></label></td>}<td className="p-3"><span className="flex items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200" style={{ backgroundColor: category.color ?? undefined }}><CategoryIcon value={category.icon} className="h-4 w-4 text-slate-900" /></span><span className="min-w-32 break-words font-medium">{category.name}</span></span></td><td className="p-3">{category.order}</td><td className="p-3">{category.salesGroup}</td><td className="p-3">{category._count.products}</td></tr>)}</tbody></table>
      </div>}
    </>}
    {editor && <CategoryEditor categories={editor === "update" ? selectedCategories : undefined} onClose={() => setEditor(null)} onSaved={saved} />}
    {deleting && <CategoryDeleteDialog categories={categories} selectedIds={selectedCategories.map(category => category.id)} canMove={canUpdate} onClose={() => setDeleting(false)} onDeleted={(ids, text) => { setDeleting(false); setSelected(new Set()); setMessage(text); onDeleted(ids); }} />}
  </section>;
}
