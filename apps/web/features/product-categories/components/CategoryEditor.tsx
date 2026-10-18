"use client";

import { useState, type FormEvent } from "react";
import { CategoryRequestError, categoryRowErrors, useCategoryManagement } from "../hooks/useCategoryManagement";
import type { CategoryDraft, ManagedCategory } from "../types";
import { buttonClass, CategoryDialog, fieldClass, primaryClass } from "./CategoryDialog";

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
const icons = ["disc", "droplets", "file-text", "id-card", "image", "package", "pen-tool", "printer", "settings", "stamp"];
const groups = { ATK: "Alat tulis kantor", PAPER: "Kertas", CARTRIDGE: "Cartridge", INK: "Tinta", OTHER: "Lainnya" };

export function CategoryEditor({ categories, onClose, onSaved }: {
  categories?: ManagedCategory[]; onClose: () => void; onSaved: (message: string) => void;
}) {
  const [originals] = useState(() => categories?.map(category => ({ ...category })));
  const [rows, setRows] = useState<CategoryDraft[]>(() => originals?.map(category => ({ name: category.name, icon: category.icon, color: category.color, order: category.order, salesGroup: category.salesGroup })) ?? [emptyDraft()]);
  const mutation = useCategoryManagement();
  const [error, setError] = useState<unknown>(null);
  const update = (index: number, patch: Partial<CategoryDraft>) => {
    setError(null);
    setRows(current => current.map((row, i) => i === index ? { ...row, ...patch } : row));
  };
  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const drafts = rows.map(row => ({ ...row, name: row.name.trim() }));
    const patches = originals ? categoryPatches(originals, drafts) : [];
    try {
      if (originals && patches.length === 0) { onClose(); return; }
      const result = await mutation.execute(originals ? { action: "update", categories: patches } : { action: "create", categories: drafts });
      onSaved(result.message);
    } catch (cause) { setError(originals ? remapCategoryPatchErrors(cause, originals, patches) : cause); }
  }
  return (
    <CategoryDialog title={originals ? `Ubah ${originals.length} Kategori` : "Tambah Kategori"} onClose={onClose} busy={mutation.isPending} error={error}>
      <p className="text-sm text-slate-600">Setiap baris dapat memiliki detail berbeda. Semua baris disimpan bersama setelah validasi berhasil.</p>
      <form onSubmit={save} className="space-y-4">
        <fieldset disabled={mutation.isPending} className="space-y-4">
          {rows.map((row, index) => {
            const errors = categoryRowErrors(error, index);
            return <section key={originals?.[index]?.id ?? index} className="space-y-3 rounded-xl border border-slate-200 p-4" aria-label={`Kategori ${index + 1}`}>
              <div className="flex items-center justify-between gap-3"><h3 className="font-bold">Kategori {index + 1}</h3>{!originals && rows.length > 1 && <button type="button" className={buttonClass} onClick={() => { setError(null); setRows(current => current.filter((_, i) => i !== index)); }}>Buang baris {index + 1}</button>}</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="space-y-1 text-sm font-medium">Nama kategori {index + 1}<input aria-invalid={errors.length ? true : undefined} aria-describedby={errors.length ? `category-errors-${index}` : undefined} className={fieldClass} required maxLength={150} value={row.name} onChange={event => update(index, { name: event.target.value })} /></label>
                <label className="space-y-1 text-sm font-medium">Ikon {index + 1}<select className={fieldClass} value={row.icon ?? ""} onChange={event => update(index, { icon: event.target.value || null })}><option value="">Bawaan</option>{row.icon && !icons.includes(row.icon) && <option value={row.icon}>{row.icon}</option>}{icons.map(icon => <option key={icon} value={icon}>{icon}</option>)}</select></label>
                <label className="space-y-1 text-sm font-medium">Warna {index + 1}<input className={fieldClass} placeholder="#2563eb atau kosong" pattern="#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})" value={row.color ?? ""} onChange={event => update(index, { color: event.target.value || null })} /></label>
                <label className="space-y-1 text-sm font-medium">Urutan {index + 1}<input className={fieldClass} type="number" min={0} step={1} required value={Number.isNaN(row.order) ? "" : row.order} onChange={event => update(index, { order: event.target.valueAsNumber })} /></label>
                <label className="space-y-1 text-sm font-medium">Kelompok penjualan {index + 1}<select className={fieldClass} value={row.salesGroup} onChange={event => update(index, { salesGroup: event.target.value as CategoryDraft["salesGroup"] })}>{Object.entries(groups).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              </div>
              {errors.length > 0 && <ul id={`category-errors-${index}`} className="list-inside list-disc text-sm text-red-700">{errors.map((message, i) => <li key={i}>{message}</li>)}</ul>}
            </section>;
          })}
          {!originals && <button type="button" className={buttonClass} onClick={() => { setError(null); setRows(current => [...current, emptyDraft()]); }}>Tambah Baris</button>}
        </fieldset>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" className={buttonClass} disabled={mutation.isPending} onClick={onClose}>Batal</button><button className={primaryClass} disabled={mutation.isPending}>{mutation.isPending ? "Menyimpan..." : "Simpan Kategori"}</button></div>
      </form>
    </CategoryDialog>
  );
}
