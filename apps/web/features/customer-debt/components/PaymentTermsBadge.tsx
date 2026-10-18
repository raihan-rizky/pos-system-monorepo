"use client";

import { getPaymentPresentation } from "../helpers/payment-presentation";
import { Check, Clock3 } from "lucide-react";
import { formatRupiah } from "@/lib/utils";

interface PaymentTermsBadgeProps {
  status: string;
  paymentMethod: string;
  total: number;
  amountPaid: number;
}

export function PaymentTermsBadge({
  status,
  paymentMethod,
  total,
  amountPaid,
}: PaymentTermsBadgeProps) {
  const presentation = getPaymentPresentation({
    status,
    paymentMethod,
    total,
    amountPaid,
  });

  if (!presentation.badge) return null;

  const isTempo = presentation.badge === "TEMPO/TAGIHAN";
  const stateLabel = presentation.settled
    ? "Lunas"
    : isTempo
      ? "Belum lunas"
      : null;
  const description = isTempo
    ? presentation.settled
      ? "Pembayaran tempo sudah lunas."
      : `Sisa tagihan: ${formatRupiah(presentation.remaining)}`
    : undefined;
  const Icon = presentation.settled ? Check : Clock3;

  return (
    <span
      role="status"
      aria-label={stateLabel ? `${presentation.badge}, ${stateLabel}` : presentation.badge}
      aria-description={description}
      title={description}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold leading-4 ${
        isTempo
          ? presentation.settled
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-amber-200 bg-amber-50 text-amber-800"
          : "border-sky-200 bg-sky-50 text-sky-800"
      }`}
    >
      {isTempo && <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />}
      <span>{isTempo ? (presentation.settled ? "Lunas" : "Tempo") : "DP"}</span>
    </span>
  );
}
