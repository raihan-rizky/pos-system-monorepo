"use client";

import React, { useCallback } from "react";
import { Modal } from "@pos/ui";
import { CheckCircle2, AlertTriangle, FileText, User } from "lucide-react";
import type { JobOrder } from "@/hooks/useJobOrders";

interface ConfirmDeliveryModalProps {
  order: JobOrder | null;
  isPending?: boolean;
  onConfirm: (orderId: string) => void;
  onClose: () => void;
}

export function ConfirmDeliveryModal({
  order,
  isPending = false,
  onConfirm,
  onClose,
}: ConfirmDeliveryModalProps) {
  const handleConfirm = useCallback(() => {
    if (!order || isPending) return;
    onConfirm(order.id);
  }, [order, isPending, onConfirm]);

  if (!order) return null;

  const remaining = order.total - order.amountPaid;
  const hasOutstandingDebt = order.status === "DP" && remaining > 0;
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);
  const formattedRemaining = new Intl.NumberFormat("id-ID").format(remaining);

  return (
    <Modal open={Boolean(order)} onClose={onClose} size="sm">
      <div className="flex flex-col items-center text-center pt-2 pb-1">
        <div
          aria-hidden="true"
          className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mb-4"
        >
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h2 className="text-lg font-bold text-surface-900 mb-1">
          Mark as Delivered?
        </h2>
        <p className="text-sm text-surface-500">
          This job order will be moved off the production board.
        </p>
      </div>

      <div className="mt-5 rounded-xl border border-surface-200 bg-surface-50/60 p-4 text-left space-y-2">
        <div className="flex items-center gap-2 text-xs text-surface-500">
          <FileText className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="font-mono font-semibold text-surface-700">
            {order.invoiceNumber}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-surface-900 font-semibold">
          <User className="w-3.5 h-3.5 text-surface-400" aria-hidden="true" />
          {order.customerName || "Walk-in customer"}
        </div>
        <p className="text-xs text-surface-500">
          {order.items.length}{" "}
          {order.items.length === 1 ? "product" : "products"} • {itemCount}{" "}
          {itemCount === 1 ? "item" : "items"}
        </p>
      </div>

      {hasOutstandingDebt ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3"
        >
          <AlertTriangle
            className="w-4 h-4 text-amber-600 shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <div className="text-left">
            <p className="text-xs font-semibold text-amber-800">
              Outstanding balance: Rp {formattedRemaining}
            </p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              This DP order still has a remaining balance. Confirm pickup only
              if payment has been settled.
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="flex-1 py-2.5 rounded-xl border border-surface-200 bg-white text-sm font-semibold
                     text-surface-700 hover:bg-surface-50 transition-colors cursor-pointer min-h-[40px]
                     disabled:opacity-60 disabled:cursor-not-allowed
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-400/40"
        >
          Cancel
        </button>
        <button
          type="button"
          autoFocus
          onClick={handleConfirm}
          disabled={isPending}
          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl
                     bg-emerald-600 text-white text-sm font-semibold
                     hover:bg-emerald-700 active:bg-emerald-800 transition-colors cursor-pointer min-h-[40px]
                     disabled:opacity-60 disabled:cursor-not-allowed
                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
        >
          {isPending ? (
            "Marking..."
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
              Confirm delivery
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}

export default ConfirmDeliveryModal;
