"use client";

import { getPaymentPresentation } from "../helpers/payment-presentation";

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

  return (
    <span
      role="status"
      aria-label={stateLabel ? `${presentation.badge}, ${stateLabel}` : presentation.badge}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide ${
        isTempo
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-sky-200 bg-sky-50 text-sky-800"
      }`}
    >
      <span>{isTempo ? "Tempo/Tagihan" : "DP"}</span>
      {stateLabel && (
        <span className="rounded-full bg-white/70 px-1.5 py-0.5 font-semibold">
          {stateLabel}
        </span>
      )}
    </span>
  );
}
