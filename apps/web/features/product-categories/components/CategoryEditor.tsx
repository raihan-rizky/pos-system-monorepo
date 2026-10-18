"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, Plus, Save, Search, Trash2 } from "lucide-react";
import { CategoryRequestError, categoryRowErrors, useCategoryManagement } from "../hooks/useCategoryManagement";
import type { CategoryDraft, ManagedCategory } from "../types";
import { buttonClass, CategoryDialog, fieldClass, primaryClass } from "./CategoryDialog";
import { CategoryIconPicker } from "./CategoryIconPicker";
import { CategoryColorPicker } from "./CategoryColorPicker";

const fields = ["name", "icon", "color", "order", "salesGroup"] as const;
export function categoryPatches(originals: ManagedCategory[], drafts: CategoryDraft[]) {
  return drafts.flatMap((draft, index) => {
    const patch: { id: string } & Partial<CategoryDraft> = { id: originals[index].id };
    for (const field of fields) {
      if (draft[field] !== originals[index][field]) Object.assign(patch, { [field]: draft[field] });
    }
    return Object.keys(patch).length > 1 ? [patch] : [];
  });
}

export function remapCategoryPatchErrors(error: unknown, originals: ManagedCategory[], submitted: { id: string }[]) {
  if (!(error instanceof CategoryRequestError) || !error.errors) return error;
  const errors = Object.fromEntries(Object.entries(error.errors).map(([path, messages]) => {
    const match = /^categories\.(\d+)(.*)$/.exec(path);
    if (!match) return [path, messages];
    const submittedId = submitted[Number(match[1])]?.id;
    const originalIndex = originals.findIndex(category => category.id === submittedId);
    return [originalIndex < 0 ? path : `categories.${originalIndex}${match[2]}`, messages];
  }));
  return new CategoryRequestError(error.message, error.status, error.code, errors);
}

const emptyDraft = (): CategoryDraft => ({ name: "", icon: null, color: null, order: 0, salesGroup: "OTHER" });
const groups = { ATK: "Alat tulis kantor", PAPER: "Kertas", CARTRIDGE: "Cartridge", INK: "Tinta", OTHER: "Lainnya" };

export function CategoryEditor({ categories, onClose, onSaved }: {
  categories?: ManagedCategory[]; onClose: () => void; onSaved: (message: string) => void;
}) {
  const [originals] = useState(() => categories?.map(category => ({ ...category })));
  const [rows, setRows] = useState(() => originals?.map(category => ({ key: category.id, draft: { name: category.name, icon: category.icon, color: category.color, order: category.order, salesGroup: category.salesGroup } })) ?? [{ key: "new-0", draft: emptyDraft() }]);
  const nextKey = useRef(1);
  const formId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [search, setSearch] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const mutation = useCategoryManagement();
  const [error, setError] = useState<unknown>(null);
  const update = (index: number, patch: Partial<CategoryDraft>) => {
    setError(null);
    setRows(current => current.map((row, i) => i === index ? { ...row, draft: { ...row.draft, ...patch } } : row));
  };
  const drafts = rows.map(({ draft }) => ({ ...draft, name: draft.name.trim() }));
  const changedIds = new Set(originals ? categoryPatches(originals, drafts).map(patch => patch.id) : []);
  const query = search.trim().toLocaleLowerCase("id");
  const visible = rows.map((entry, index) => ({ ...entry, index })).filter(({ key, draft }) => key === editingKey || draft.name.toLocaleLowerCase("id").includes(query));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (mutation.isPending) return;
    setError(null);
    const invalidIndex = drafts.findIndex(row => !row.name || !Number.isInteger(row.order) || row.order < 0 || row.order > 2_147_483_647);
    if (invalidIndex >= 0) {
      setSearch("");
      setError(new Error(`Periksa nama dan urutan pada kategori ${invalidIndex + 1}.`));
      requestAnimationFrame(() => {
        const row = formRef.current?.querySelector(`[data-row-index="${invalidIndex}"]`);
        if (!drafts[invalidIndex].name) row?.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
        else { const details = row?.querySelector("details"); if (details) details.open = true; row?.querySelector<HTMLInputElement>('input[type="number"]')?.focus(); }
      });
      return;
    }
    const patches = originals ? categoryPatches(originals, drafts) : [];
    try {
      if (originals && patches.length === 0) { onClose(); return; }
      const result = await mutation.execute(originals ? { action: "update", categories: patches } : { action: "create", categories: drafts });
      onSaved(result.message);
    } catch (cause) { setSearch(""); setError(originals ? remapCategoryPatchErrors(cause, originals, patches) : cause); }
  }
  return (
    <CategoryDialog title={originals ? `Ubah ${originals.length} Kategori` : "Tambah Kategori"} description="Atur nama, ikon, dan warna. Buka pengaturan tambahan untuk urutan dan kelompok penjualan." onClose={onClose} busy={mutation.isPending} error={error}
      footer={<div className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="flex items-center gap-1.5 text-sm text-slate-600"><Check aria-hidden="true" className="h-4 w-4" />{originals ? changedIds.size ? `${changedIds.size} kategori berubah` : "Belum ada perubahan" : `${rows.length} kategori baru`}</p>
        <div className="flex w-full gap-2 sm:w-auto"><button type="button" className={`${buttonClass} flex-1 sm:flex-none`} disabled={mutation.isPending} onClick={onClose}>Batal</button><button form={formId} type="submit" aria-label="Simpan Kategori" className={`${primaryClass} inline-flex flex-1 items-center justify-center gap-2 sm:flex-none`} disabled={mutation.isPending}><Save aria-hidden="true" className="h-4 w-4" />{mutation.isPending ? "Menyimpan..." : originals && changedIds.size ? `Simpan ${changedIds.size} Perubahan` : "Simpan Kategori"}</button></div>
      </div>}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="relative w-full sm:max-w-sm"><span className="sr-only">Cari kategori dalam editor</span><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input type="search" className={`${fieldClass} pl-9`} value={search} onChange={event => { setEditingKey(null); setSearch(event.target.value); }} onKeyDown={event => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Cari kategori di daftar ini..." /></label>
        <p className="text-xs text-slate-500">{visible.length} dari {rows.length} kategori{query && " · Perubahan tetap tersimpan saat mencari"}</p>
      </div>
      <form id={formId} ref={formRef} onSubmit={save} onInvalidCapture={event => { const details = (event.target as HTMLElement).closest("details"); if (details) details.open = true; }} className="min-w-0 space-y-3">
        <fieldset disabled={mutation.isPending} className="min-w-0 space-y-3">
          <table role="table" aria-label="Daftar kategori" className="block w-full table-fixed border-separate border-spacing-0 text-left text-sm md:table">
            <thead role="rowgroup" className="hidden text-xs text-slate-500 md:table-header-group"><tr role="row"><th role="columnheader" className="w-[38%] border-b border-slate-200 px-3 pb-2 font-medium">Nama kategori</th><th role="columnheader" className="w-[19%] border-b border-slate-200 px-2 pb-2 font-medium">Ikon</th><th role="columnheader" className="w-[19%] border-b border-slate-200 px-2 pb-2 font-medium">Warna</th><th role="columnheader" className="w-[24%] border-b border-slate-200 px-2 pb-2 font-medium">Pengaturan</th></tr></thead>
            <tbody role="rowgroup" className="block space-y-3 md:table-row-group md:space-y-0">{visible.map(({ key, draft: row, index }) => {
            const errors = categoryRowErrors(error, index);
            const changed = changedIds.has(key);
            return <tr role="row" data-row-index={index} key={key} onFocusCapture={() => setEditingKey(key)} aria-label={`Kategori ${index + 1}`} className={`grid grid-cols-2 gap-x-2 rounded-xl border p-3 align-top motion-safe:transition-colors md:table-row md:border-0 md:p-0 ${changed ? "border-sky-200 bg-sky-50/50" : "border-slate-200"}`}>
              <td role="cell" className="col-span-2 min-w-0 pb-2 md:border-b md:border-slate-100 md:px-3 md:py-3"><label className="block text-xs font-medium text-slate-600"><span className="mb-1 block md:sr-only">Nama kategori {index + 1}</span><input type="text" aria-invalid={errors.length ? true : undefined} aria-describedby={errors.length ? `${formId}-errors-${index}` : undefined} className={`${fieldClass} font-medium`} required maxLength={150} value={row.name} onChange={event => update(index, { name: event.target.value })} /></label>
                {changed && <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-sky-700"><Check aria-hidden="true" className="h-3 w-3" />Diubah</span>}
                {errors.length > 0 && <ul id={`${formId}-errors-${index}`} className="mt-1 list-inside list-disc text-xs text-red-700">{errors.map((message, i) => <li key={i}>{message}</li>)}</ul>}
              </td>
              <td role="cell" className="min-w-0 pb-2 md:border-b md:border-slate-100 md:px-2 md:py-3"><CategoryIconPicker value={row.icon} color={row.color} disabled={mutation.isPending} label={`Ikon ${index + 1}`} onChange={icon => update(index, { icon })} /></td>
              <td role="cell" className="min-w-0 pb-2 md:border-b md:border-slate-100 md:px-2 md:py-3"><CategoryColorPicker value={row.color} icon={row.icon} name={row.name} disabled={mutation.isPending} label={`Warna ${index + 1}`} onChange={color => update(index, { color })} /></td>
              <td role="cell" className="col-span-2 min-w-0 md:border-b md:border-slate-100 md:px-2 md:py-3"><details className="group"><summary aria-label={`Pengaturan tambahan ${index + 1}`} className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-1 rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-600 [&::-webkit-details-marker]:hidden"><span>Pengaturan tambahan<span className="sr-only"> {index + 1}</span></span><ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 group-open:rotate-180 motion-safe:transition-transform" /></summary>
                <div className="space-y-3 px-1 pb-2 pt-2"><label className="block space-y-1 text-xs font-medium">Urutan {index + 1}<input className={fieldClass} type="number" min={0} max={2_147_483_647} step={1} required value={Number.isNaN(row.order) ? "" : row.order} onChange={event => update(index, { order: event.target.valueAsNumber })} /></label><label className="block space-y-1 text-xs font-medium">Kelompok penjualan {index + 1}<select className={fieldClass} value={row.salesGroup} onChange={event => update(index, { salesGroup: event.target.value as CategoryDraft["salesGroup"] })}>{Object.entries(groups).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>{originals && <p className="text-xs text-slate-500">{originals[index]._count.products} produk dalam kategori ini</p>}</div>
              </details>{!originals && rows.length > 1 && <button type="button" aria-label={`Buang baris ${index + 1}`} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-600" onClick={() => { setError(null); setRows(current => current.filter((_, i) => i !== index)); }}><Trash2 aria-hidden="true" className="h-3.5 w-3.5" />Buang baris</button>}</td>
            </tr>;
          })}</tbody></table>
          {visible.length === 0 && <div className="py-8 text-center"><p className="text-sm text-slate-600">Tidak ada kategori yang cocok.</p><button type="button" className={`${buttonClass} mt-3`} onClick={() => setSearch("")}>Tampilkan semua</button></div>}
          {!originals && <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={rows.length >= 100} className={`${buttonClass} inline-flex items-center gap-2`} onClick={() => { setError(null); setSearch(""); const key = `new-${nextKey.current++}`; setRows(current => [...current, { key, draft: emptyDraft() }]); }}><Plus aria-hidden="true" className="h-4 w-4" />Tambah Baris</button><p className="text-xs text-slate-500">Maksimal 100 kategori sekali simpan.</p></div>}
        </fieldset>
      </form>
    </CategoryDialog>
  );
}
