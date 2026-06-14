"use client";

import React, { useState } from "react";
import { Truck } from "lucide-react";
import type { Transaction } from "@/hooks/useTransactions";
import { getSuratJalanEligibility } from "../helpers/surat-jalan-core";
import { SuratJalanCreateModal } from "./SuratJalanCreateModal";

export function isTransactionEligibleForSuratJalan(transaction: Transaction): boolean {
  return getSuratJalanEligibility({
    status: transaction.status,
    items: transaction.items.map((item) => ({
      id: item.id,
      productId: item.productId ?? null,
      printingServiceId: item.printingServiceId ?? null,
      productName: item.productName,
      quantity: item.quantity,
      unit: item.product?.unit ?? item.printingService?.unit ?? null,
      currentStock: null,
    })),
  }).eligible;
}

export function SuratJalanBundleButton({ transaction }: { transaction: Transaction }) {
  const [open, setOpen] = useState(false);

  if (!isTransactionEligibleForSuratJalan(transaction)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      >
        <Truck className="h-4 w-4" />
        Cetak Surat Jalan
      </button>
      <SuratJalanCreateModal
        open={open}
        transactionId={transaction.id}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
