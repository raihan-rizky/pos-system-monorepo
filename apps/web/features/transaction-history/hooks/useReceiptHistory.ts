"use client";

import { useQuery } from "@tanstack/react-query";
import { useRole } from "@/components/providers/RoleProvider";
import { receiptHistoryRange, type ReceiptHistoryContext } from "../helpers/receipt-history";

type ReceiptBreakdown = {
  paymentBreakdown?: Array<{ method: string; amount: number }>;
  categoryBreakdown?: Array<{ category: string; amount: number }>;
};
type ReceiptItem = ReceiptBreakdown & { transactionId: string; invoiceNumber: string | null; date: string; amount: number; methods: string[] };
type ManualEntry = ReceiptBreakdown & { id: string; description: string | null; date: string; amount: number; methods: string[] };
export type ReceiptHistoryData = {
  items: ReceiptItem[];
  manualDetailsAvailable: boolean;
  manualEntries?: ManualEntry[];
  summary?: { total: number; paymentMethods?: Array<{ method: string; amount: number }> };
  comparisonAccess?: { read: boolean; create: boolean; update: boolean };
};

export class ReceiptHistoryError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function useReceiptHistory(context: ReceiptHistoryContext) {
  const { userId, storeId, authorizationFingerprint } = useRole();
  const range = receiptHistoryRange(context.date, context.mode === "outstanding-dp" ? "daily" : context.period ?? "daily");
  return useQuery({
    queryKey: ["receipt-history", userId, storeId, authorizationFingerprint, context],
    gcTime: 0,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ mode: context.mode, ...range });
      if (context.category) params.set("category", context.category);
      if (context.subcategory) params.set("subcategory", context.subcategory);
      if (context.method) params.set("method", context.method);
      if (context.previewSales) params.set("view", "sales");
      const response = await fetch(`/api/history/receipts?${params}`, { signal, cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new ReceiptHistoryError(body?.message || "Riwayat penerimaan belum dapat dimuat.", response.status);
      }
      return response.json() as Promise<ReceiptHistoryData>;
    },
  });
}
