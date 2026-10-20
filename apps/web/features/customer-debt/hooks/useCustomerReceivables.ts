"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ReceivablePaymentMethod = "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER";
export interface CustomerReceivable {
  id: string;
  customerId: string;
  customer: { id: string; name: string };
  amount: number | string;
  amountPaid: number | string;
  debtDate: string;
  dueDate: string;
  note: string | null;
  createdAt: string;
  payments: { id: string; amount: number | string; method: ReceivablePaymentMethod; note: string | null; createdAt: string }[];
}

export interface ReceivableListParams {
  customerId?: string;
  page?: number;
  search?: string;
  status: "open" | "all";
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.message ?? body?.error;
    throw new Error(typeof message === "string" ? message : "Piutang belum berhasil disimpan. Silakan coba lagi.");
  }
  if (body === null) throw new Error("Respons piutang belum bisa dibaca. Silakan coba lagi.");
  return body as T;
}

export function useCustomerReceivables(params: ReceivableListParams) {
  return useQuery({
    queryKey: ["customer-receivables", params],
    queryFn: async () => {
      const search = new URLSearchParams({ page: String(params.page ?? 1), status: params.status });
      if (params.customerId) search.set("customerId", params.customerId);
      if (params.search) search.set("search", params.search);
      return readResponse<{ data: CustomerReceivable[]; pagination: { page: number; total: number; totalPages: number } }>(await fetch(`/api/customer-receivables?${search}`));
    },
  });
}

function useReceivableMutation<T extends object>(getPath: (payload: T) => string) {
  const queryClient = useQueryClient();
  const attempt = useRef<{ payload: string; id: string } | null>(null);
  return useMutation({
    mutationFn: async (payload: T) => {
      const serialized = JSON.stringify(payload);
      if (attempt.current?.payload !== serialized) attempt.current = { payload: serialized, id: crypto.randomUUID() };
      return readResponse<CustomerReceivable>(await fetch(getPath(payload), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, clientMutationId: attempt.current.id }),
      }));
    },
    onSuccess: async () => {
      attempt.current = null;
      await Promise.all(["customers", "customer-recap", "customer-receivables"].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
    },
  });
}

export function useCreateCustomerReceivable() {
  return useReceivableMutation<{ customerId: string; amount: number; debtDate: string; dueDate: string; note?: string }>(() => "/api/customer-receivables");
}

export function usePayCustomerReceivable(id: string) {
  return useReceivableMutation<{ amount: number; method: ReceivablePaymentMethod; note?: string }>(() => `/api/customer-receivables/${id}/payments`);
}
