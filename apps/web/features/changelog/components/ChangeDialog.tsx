"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

let activeDialogs = 0;
let originalOverflow = "";

export function ChangeDialog({ open, onClose, title, children, wide = false, compact = false }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean; compact?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (activeDialogs === 0) originalOverflow = document.body.style.overflow;
    activeDialogs += 1;
    dialog.setAttribute("closedby", "any");
    if (!dialog.open) dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      activeDialogs -= 1;
      if (activeDialogs === 0) document.body.style.overflow = originalOverflow;
      if (dialog.open) dialog.close();
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={event => { event.stopPropagation(); event.preventDefault(); onClose(); }}
      onClose={event => {
        event.stopPropagation();
        // Strict Mode may queue a close event before reopening the same dialog.
        if (event.target === event.currentTarget && !event.currentTarget.open) onClose();
      }}
      onClick={event => {
        // Safari fallback: only dismiss clicks outside the dialog's actual bounds.
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
      }}
      className={`m-auto max-h-[90dvh] w-[calc(100%-2rem)] overscroll-contain rounded-3xl border border-surface-200 bg-surface-50 p-0 text-surface-900 shadow-2xl backdrop:overflow-hidden backdrop:overscroll-contain backdrop:bg-surface-950/60 ${compact ? "max-w-lg overflow-hidden open:flex open:flex-col" : `${wide ? "max-w-5xl" : "max-w-2xl"} overflow-y-auto`}`}
    >
      <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-4 border-b border-surface-200 bg-white px-5 py-4 sm:px-7">
        <h2 id={titleId} className="text-lg font-extrabold tracking-tight">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Tutup" autoFocus className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-surface-600 transition-colors hover:bg-surface-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>
      {children}
    </dialog>
  );
}
