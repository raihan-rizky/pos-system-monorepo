"use client";

import { useEffect, useId, useRef } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@pos/ui";
import type { ProductCartItem } from "@/hooks/useCart";

export function CartStockWarningDialog({ item, quantity, onCancel, onConfirm }: {
  item: ProductCartItem;
  quantity: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      if (dialog.open) dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onCancel();
      }}
      onClose={(event) => {
        event.stopPropagation();
        if (!event.currentTarget.open) onCancel();
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const rect = event.currentTarget.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onCancel();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-2xl border border-surface-200 bg-white p-5 text-surface-900 shadow-2xl backdrop:bg-black/45"
    >
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 id={titleId} className="text-lg font-bold">Jumlah melebihi stok</h2>
      </div>
      <p id={descriptionId} className="break-words text-sm leading-6 text-surface-600">
        Stok <strong className="font-semibold text-surface-900">{item.name}</strong> tersedia {item.stock} {item.unit}.
        {" "}Jumlah akan diubah menjadi <strong className="font-semibold text-surface-900">{quantity} {item.unit}</strong>.
        {" "}Jika transaksi diproses, stok bisa menjadi negatif.
      </p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" autoFocus onClick={onCancel} className="min-h-11">Batal</Button>
        <Button type="button" variant="accent" onClick={onConfirm} className="min-h-11">Tetap Tambahkan</Button>
      </div>
    </dialog>
  );
}
