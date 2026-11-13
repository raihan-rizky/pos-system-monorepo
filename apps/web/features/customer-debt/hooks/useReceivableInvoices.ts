"use client";

import { useQuery } from "@tanstack/react-query";
import type { CustomerType } from "@/lib/customers";
import { notifyPermissionDenied } from "@/features/rbac/helpers/permission-denied";

export interface ReceivableInvoice {
  id: string;
  invoiceNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  customerType: CustomerType;
  status: string;
  paymentMethod: string;
  total: number;
  amountPaid: number;
  createdAt: string;
  invoiceDate: string | null;
  debtPaymentLogs: { id: string; amount: number; paymentMethod: string; createdAt: string }[];
}

export interface ReceivableInvoiceParams {
  search?: string;
  status: "all" | "open" | "settled";
  dateFrom?: string;
  dateTo?: string;
  customerType?: CustomerType | "";
  page?: number;
}

export function useReceivableInvoices(params: ReceivableInvoiceParams) {
  return useQuery({
    queryKey: ["receivable-invoices", params],
    queryFn: async () => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== "") query.set(key, String(value));
      }
      const response = await fetch(`/api/customer-receivables/invoices?${query}`);
      if (!response.ok) {
        notifyPermissionDenied(response.status);
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || "Invoice piutang belum bisa dimuat.");
      }
      return response.json() as Promise<{ data: ReceivableInvoice[]; pagination: { page: number; total: number; totalPages: number } }>;
    },
  });
}
