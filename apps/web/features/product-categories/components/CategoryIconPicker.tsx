"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { CATEGORY_ICON_OPTIONS, searchCategoryIcons } from "@/lib/category-icon-catalog";
import { CategoryIcon } from "@/lib/category-icons";
import { buttonClass, fieldClass } from "./CategoryDialog";
import { categoryColorStyle } from "./category-colors";

const groups = [...new Set(CATEGORY_ICON_OPTIONS.map((option) => option.group))];
const focusClass = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600";

interface CategoryIconPickerProps {
  value: string | null;
  color?: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  label: string;
}

export function CategoryIconPicker({ value, color, onChange, disabled = false, label }: CategoryIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const searchId = useId();
  const groupId = useId();
  const selected = CATEGORY_ICON_OPTIONS.find((option) => option.id === value);
  const options = searchCategoryIcons(query, group);
  const iconStyle = categoryColorStyle(color);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    searchRef.current?.focus();
    return () => {
      dialog?.close();
      trigger?.focus();
    };
  }, [open]);

  function selectIcon(next: string | null) {
    if (disabled) return;
    onChange(next);
    setOpen(false);
  }

  return (
    <>
      <button ref={triggerRef} type="button" aria-label={label} aria-haspopup="dialog" aria-expanded={open}
        disabled={disabled} onClick={() => { setQuery(""); setGroup(""); setOpen(true); }}
        className={`flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-800 motion-safe:transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:opacity-60 ${focusClass}`}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={iconStyle}>
          <CategoryIcon value={value} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1 truncate">{selected?.label ?? "Ikon bawaan"}</span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && <dialog ref={dialogRef} aria-labelledby={titleId}
        onCancel={(event) => { event.preventDefault(); event.stopPropagation(); setOpen(false); }}
        onClose={(event) => { event.stopPropagation(); setOpen(false); }}
        onKeyDown={(event) => { if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault(); }}
        className="m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50">
        <div className="flex max-h-[88dvh] flex-col">
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 p-4 sm:px-5">
            <div>
              <h2 id={titleId} className="text-lg font-bold">Pilih ikon kategori</h2>
              <p className="mt-1 text-xs text-slate-500">Pilih gambar yang mudah dikenali untuk kategori ini.</p>
              <p className="mt-1 text-xs text-slate-500">Hapus ikon untuk kembali ke ikon bawaan.</p>
            </div>
            <button type="button" aria-label="Tutup pilihan ikon" onClick={() => setOpen(false)} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 ${focusClass}`}>
              <X aria-hidden="true" className="h-5 w-5" />
            </button>
          </header>

          <div className="shrink-0 space-y-3 border-b border-slate-100 p-4 sm:px-5">
            <label htmlFor={searchId} className="sr-only">Cari ikon kategori</label>
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <input ref={searchRef} id={searchId} value={query} onChange={(event) => setQuery(event.target.value)}
                placeholder="Cari ikon..." autoComplete="off" className={`${fieldClass} pl-9`} />
            </div>
            <div className="flex min-w-0 items-center gap-3">
              <label htmlFor={groupId} className="shrink-0 text-xs font-semibold text-slate-600">Kelompok</label>
              <select id={groupId} value={group} onChange={(event) => setGroup(event.target.value)} className={`${fieldClass} min-w-0 flex-1`}>
                <option value="">Semua kelompok</option>
                {groups.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <p aria-live="polite" role="status" className="text-xs text-slate-500">{options.length} ikon tersedia{selected ? ` · Terpilih: ${selected.label}` : ""}</p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:px-5">
            {options.length ? <div className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label="Pilihan ikon kategori">
              {options.map((option) => {
                const isSelected = value === option.id;
                return <button key={option.id} type="button" aria-label={option.label} aria-pressed={isSelected}
                  disabled={disabled} onClick={() => selectIcon(option.id)}
                  className={`relative flex min-h-20 min-w-0 flex-col items-center gap-2 rounded-xl border px-1.5 py-3 text-center motion-safe:transition-colors ${focusClass} ${isSelected ? "border-sky-600 bg-sky-50 ring-1 ring-sky-600" : "border-slate-200 hover:border-sky-400 hover:bg-slate-50"}`}>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={iconStyle}><CategoryIcon value={option.id} className="h-6 w-6" /></span>
                  <span className="line-clamp-2 w-full break-words text-[10px] leading-4 text-slate-700">{option.label}</span>
                  {isSelected && <Check aria-hidden="true" className="absolute right-1 top-1 h-3.5 w-3.5 text-sky-700" />}
                </button>;
              })}
            </div> : <p className="px-3 py-10 text-center text-sm text-slate-500">Ikon tidak ditemukan. Coba kata lain atau kelompok lain.</p>}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-slate-200 p-4 sm:px-5">
            <button type="button" disabled={disabled || !value} onClick={() => selectIcon(null)} className={`${buttonClass} text-red-700`}>Hapus ikon</button>
            <button type="button" onClick={() => setOpen(false)} className={buttonClass}>Batal</button>
          </footer>
        </div>
      </dialog>}
    </>
  );
}
