"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export const fieldClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:bg-slate-100";
export const buttonClass = "min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50";
export const primaryClass = `${buttonClass} border-slate-900 bg-slate-900 text-white hover:bg-slate-800`;
export const dangerClass = `${buttonClass} border-red-700 bg-red-700 text-white hover:bg-red-800`;

export function CategoryDialog({ title, onClose, busy = false, error, children, footer, description, compact = false }: {
  title: string; onClose: () => void; busy?: boolean; error?: unknown; children: ReactNode;
  footer?: ReactNode; description?: string; compact?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { dialog?.close(); previousFocus?.focus(); };
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} aria-describedby={description ? `${titleId}-description` : undefined} aria-busy={busy} onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!busy) onClose(); }}
      className={`m-auto max-h-[90dvh] w-[calc(100%-2rem)] ${compact ? "max-w-xl" : "max-w-5xl"} overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50`}>
      <div className="flex max-h-[90dvh] flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 p-4 sm:px-5">
        <div className="min-w-0"><h2 id={titleId} tabIndex={-1} autoFocus className="text-lg font-bold outline-none sm:text-xl">{title}</h2>
        {description && <p id={`${titleId}-description`} className="mt-1 text-sm text-slate-600">{description}</p>}</div>
        <button type="button" disabled={busy} onClick={onClose} className={`${buttonClass} shrink-0`}>Batal</button>
      </div>
      <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-4 sm:p-5">
        {!!error && <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 focus:outline-red-600">{error instanceof Error ? error.message : "Perubahan belum berhasil. Silakan coba lagi."}</p>}
        {children}
      </div>
      {footer && <div data-category-footer="true" className="shrink-0 border-t border-slate-200 bg-white p-4 sm:px-5">{footer}</div>}
      </div>
    </dialog>
  );
}
