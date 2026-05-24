"use client";

import React, { useCallback } from "react";
import { Modal } from "@pos/ui";
import { AlertTriangle, FileText, MessageCircle, User } from "lucide-react";
import type { JobOrder } from "@/hooks/useJobOrders";

interface ConfirmPickupBroadcastModalProps {
  order: JobOrder | null;
  isPending?: boolean;
  onConfirm: (orderId: string) => void;
  onClose: () => void;
}

export function ConfirmPickupBroadcastModal({
  order,
  isPending = false,
  onConfirm,
  onClose,
}: ConfirmPickupBroadcastModalProps) {
  const handleConfirm = useCallback(() => {
    if (!order || isPending) return;
    onConfirm(order.id);
  }, [order, isPending, onConfirm]);

  const invoiceNumber = order?.invoiceNumber ?? "";
  const customerName = order?.customerName || "Pelanggan walk-in";

  return (
    <Modal open={Boolean(order)} onClose={onClose} size="sm">
      <div className="flex flex-col items-center pb-1 pt-2 text-center">
        <div
          aria-hidden="true"
          className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100"
        >
          <AlertTriangle className="h-7 w-7 text-amber-600" />
        </div>
        <h2 className="mb-1 text-lg font-bold text-surface-900">
          Broadcast WhatsApp sudah pernah dikirim
        </h2>
        <p className="text-sm text-surface-500">
          Pelanggan kemungkinan sudah menerima info pickup. Kirim ulang hanya
          jika memang diperlukan.
        </p>
      </div>

      <div className="mt-5 space-y-2 rounded-xl border border-surface-200 bg-surface-50/60 p-4 text-left">
        <div className="flex items-center gap-2 text-xs text-surface-500">
          <FileText className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-mono font-semibold text-surface-700">
            {invoiceNumber}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-surface-900">
          <User className="h-3.5 w-3.5 text-surface-400" aria-hidden="true" />
          {customerName}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="min-h-[40px] flex-1 cursor-pointer rounded-xl border border-surface-200 bg-white py-2.5 text-sm font-semibold text-surface-700 transition-colors hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-400/40"
        >
          Batal
        </button>
        <button
          type="button"
          autoFocus
          onClick={handleConfirm}
          disabled={isPending}
          className="inline-flex min-h-[40px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-700 active:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
        >
          {isPending ? (
            "Mengirim..."
          ) : (
            <>
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Kirim Lagi
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmPickupBroadcastModal;
