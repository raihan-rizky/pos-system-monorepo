"use client";

import { useId, useState } from "react";
import { Check, Palette, RotateCcw } from "lucide-react";
import { CategoryIcon } from "@/lib/category-icons";
import { buttonClass, CategoryDialog, fieldClass, primaryClass } from "./CategoryDialog";
import { CATEGORY_COLORS, categoryColorStyle } from "./category-colors";

export function CategoryColorPicker({ value, icon, name, onChange, disabled, label }: {
  value: string | null; icon: string | null; name: string; onChange: (value: string | null) => void; disabled?: boolean; label: string;
}) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open} title={value ?? "Warna bawaan"} disabled={disabled} onClick={() => setOpen(true)} className={`${buttonClass} inline-flex w-full items-center gap-2 px-3 md:w-auto`}>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-black/10" style={categoryColorStyle(value)}><Palette aria-hidden="true" className="h-3.5 w-3.5" /></span>
      <span className="text-xs">{CATEGORY_COLORS.find(color => color.value.toLowerCase() === value?.toLowerCase())?.label ?? (value || "Bawaan")}</span>
    </button>
    {open && <ColorDialog value={value} icon={icon} name={name} disabled={disabled} onClose={() => setOpen(false)} onChange={onChange} />}
  </>;
}

function ColorDialog({ value, icon, name, onChange, onClose, disabled }: {
  value: string | null; icon: string | null; name: string; onChange: (value: string | null) => void; onClose: () => void; disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const colorId = useId();
  const valid = !draft || /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(draft);
  const preview = categoryColorStyle(valid ? draft : value);
  const nativeValue = preview.backgroundColor.length === 4 ? `#${preview.backgroundColor.slice(1).split("").map(c => c + c).join("")}` : preview.backgroundColor;
  return <CategoryDialog compact title="Pilih warna kategori" description="Pilih warna yang mudah dikenali, atau gunakan kode warna sendiri." busy={disabled} onClose={onClose}
    footer={<div className="flex justify-end"><button type="button" className={primaryClass} disabled={disabled || !valid} onClick={() => { onChange(draft || null); onClose(); }}>Terapkan warna</button></div>}>
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label="Pratinjau kategori">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl" style={preview}><CategoryIcon value={icon} className="h-6 w-6" /></span>
      <div className="min-w-0"><p className="break-words font-semibold">{name.trim() || "Nama kategori"}</p><p className="text-xs text-slate-500">Pratinjau warna dan ikon</p></div>
    </div>
    <fieldset disabled={disabled} className="space-y-4" onKeyDown={event => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
      <legend className="mb-2 text-sm font-semibold">Warna pilihan</legend>
      <div className="grid grid-cols-3 gap-2">{CATEGORY_COLORS.map(color => <button key={color.value} type="button" aria-pressed={draft.toLowerCase() === color.value} onClick={() => setDraft(color.value)} className={`${buttonClass} flex flex-col items-center gap-1.5 px-1 text-xs`}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-black/10" style={categoryColorStyle(color.value)}>{draft.toLowerCase() === color.value && <Check aria-hidden="true" className="h-4 w-4" />}</span>{color.label}
      </button>)}</div>
      <div><label htmlFor={colorId} className="text-sm font-medium">Kode warna</label><div className="mt-1 flex gap-2">
        <input type="color" aria-label="Pilih warna khusus" className="h-11 w-12 shrink-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-1" value={nativeValue} onChange={event => setDraft(event.target.value)} />
        <input id={colorId} className={fieldClass} value={draft} placeholder="#2563eb" aria-invalid={!valid} aria-describedby={`${colorId}-hint`} onChange={event => setDraft(event.target.value.trim())} />
      </div><p id={`${colorId}-hint`} className={`mt-1 text-xs ${valid ? "text-slate-500" : "text-red-700"}`}>{valid ? "Gunakan #RGB atau #RRGGBB. Kosongkan untuk warna bawaan." : "Kode warna belum valid. Contoh: #2563eb atau #abc."}</p></div>
      <button type="button" className={`${buttonClass} inline-flex items-center gap-2`} onClick={() => setDraft("")}><RotateCcw aria-hidden="true" className="h-4 w-4" />Hapus warna</button>
    </fieldset>
  </CategoryDialog>;
}
