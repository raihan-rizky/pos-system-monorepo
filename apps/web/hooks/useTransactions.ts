"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CartItem } from "./useCart";
import { decrementProductStockInCache } from "@/features/pos-checkout/products-cache-update";
import { buildHistoryQueryOptions } from "@/features/transaction-history/helpers/query-options";
import {
  invalidateTransactionViews,
  scheduleTransactionViewInvalidation,
  updateTransactionInHistoryCaches,
} from "@/features/transaction-history/helpers/invalidate";
import { buildTransactionHistorySearchParams } from "@/features/transaction-history/helpers/history-params";

export interface Transaction {
  id: string;
  invoiceNumber: string | null;
  draftNumber: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  amountPaid: number;
  change: number;
  customerName: string | null;
  salesName: string | null;
  salespersonId: string | null;
  salesperson?: { name: string } | null;
  note: string | null;
  status: string; // COMPLETED, DP, PENDING_APPROVAL, VOIDED, REFUNDED, DRAFT
  createdAt: string;
  suratJalanSummary?: {
    count: number;
    confirmedCount: number;
    pendingCount: number;
    deliveredQuantity: number;
    totalQuantity: number;
  } | null;
  items: {
    id: string;
    productId?: string | null;
    printingServiceId?: string | null;
    rawMaterialProductId?: string | null;
    productName: string;
    size: string | null;
    material: string | null;
    serviceNote?: string | null;
    rawMaterialQuantity?: number | null;
    rawMaterialUnit?: string | null;
    quantity: number;
    unitPrice: number;
    pricingRuleId?: string | null;
    pricingCustomerType?: "UMUM" | "AGEN" | "INDUSTRI" | "PEMERINTAH" | null;
    pricingCategoryId?: string | null;
    pricingCategoryName?: string | null;
    pricingMode?: "FLAT_DISCOUNT" | "PERCENT_DISCOUNT" | null;
    pricingValue?: number | null;
    originalUnitPrice?: number | null;
    appliedUnitPrice?: number | null;
    subtotal: number;
    product?: { unit: string } | null;
    printingService?: { unit: string } | null;
  }[];
}

export interface PaginatedTransactions {
  data: Transaction[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface TransactionHistoryParams {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  status?: string;
  suratJalan?: "bundled";
  page?: number;
}

interface CreateTransactionInput {
  items: CartItem[];
  paymentMethod: string;
  amountPaid: number;
  discount?: number;
  note?: string;
  customerName?: string;
  customerId?: string | null;
  salesName?: string;
  salespersonId?: string;
  paymentStatus?: string; // 'COMPLETED' | 'DP'
  isJobOrder?: boolean;
  estimatedDoneAt?: string | null;
}

async function fetchTransactions(): Promise<Transaction[]> {
  const res = await fetch("/api/transactions?limit=50");
  if (!res.ok) throw new Error("Failed to fetch transactions");
  const json = (await res.json()) as PaginatedTransactions;
  return json.data;
}

async function fetchTransactionHistory(
  params: TransactionHistoryParams
): Promise<PaginatedTransactions> {
  const searchParams = buildTransactionHistorySearchParams(params);

  const res = await fetch(`/api/transactions?${searchParams.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch transactions");
  return res.json();
}

async function createTransaction(
  input: CreateTransactionInput
): Promise<Transaction> {
  const res = await fetch("/api/transactions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to create transaction");
  }
  return res.json();
}

export function useTransactions() {
  return useQuery({
    queryKey: ["transactions"],
    queryFn: fetchTransactions,
  });
}

export function useTransactionHistory(params: TransactionHistoryParams) {
  return useQuery({
    queryKey: ["transaction-history", params],
    queryFn: () => fetchTransactionHistory(params),
    ...buildHistoryQueryOptions(),
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTransaction,
    onSuccess: (_result, variables) => {
      // Optimistically decrement stock in the products cache to prevent grid flash
      const itemMap = new Map<string, number>();
      for (const item of variables.items) {
        if (item.lineType === "PRODUCT") {
          itemMap.set(item.productId, (itemMap.get(item.productId) ?? 0) + item.quantity);
        } else if (item.rawMaterialProductId && item.rawMaterialQuantity) {
          itemMap.set(
            item.rawMaterialProductId,
            (itemMap.get(item.rawMaterialProductId) ?? 0) + item.rawMaterialQuantity,
          );
        }
      }
      queryClient.setQueriesData<unknown>(
        { queryKey: ["products"] },
        (old: unknown) => decrementProductStockInCache(old, itemMap)
      );

      // Defer all background refetches until *after* the receipt has painted.
      // The product cache is already optimistic, and the cashier is staring
      // at the invoice — not the transaction history — so kicking off four
      // simultaneous fetches now would only steal main-thread time during
      // the most latency-sensitive moment of the checkout flow.
      const schedule: (cb: () => void) => void =
        typeof window !== "undefined" &&
        typeof (window as unknown as { requestIdleCallback?: unknown })
          .requestIdleCallback === "function"
          ? (cb) =>
              (window as unknown as {
                requestIdleCallback: (
                  cb: () => void,
                  opts?: { timeout: number },
                ) => number;
              }).requestIdleCallback(cb, { timeout: 500 })
          : (cb) => setTimeout(cb, 250);

      schedule(() => {
        queryClient.invalidateQueries({ queryKey: ["products"] });
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
        queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
        queryClient.invalidateQueries({ queryKey: ["job-orders"] });
      });
    },
  });
}

export interface UpdateTransactionInput {
  id: string;
  salesName?: string;
  salespersonId?: string;
  customerName?: string;
  paymentMethod?: string;
  status?: string;
}

async function updateTransaction(input: UpdateTransactionInput): Promise<Transaction> {
  const { id, ...body } = input;
  const res = await fetch(`/api/transactions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to update transaction");
  }
  return res.json();
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateTransaction,
    onSuccess: () => {
      invalidateTransactionViews(queryClient);
    },
  });
}

async function deleteTransaction(id: string): Promise<void> {
  const res = await fetch(`/api/transactions/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to delete transaction");
  }
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      invalidateTransactionViews(queryClient);
    },
  });
}

export interface ApproveTransactionInput {
  id: string;
  paymentMethod?: string;
  amountPaid?: number;
}

async function approveTransaction(input: ApproveTransactionInput): Promise<Transaction> {
  const { id, ...body } = input;
  const res = await fetch(`/api/transactions/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to approve");
  }
  return res.json();
}

export function useApproveTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: approveTransaction,
    onSuccess: (transaction) => {
      updateTransactionInHistoryCaches(queryClient, transaction);
      scheduleTransactionViewInvalidation(queryClient);
    },
  });
}

async function rejectTransaction(id: string): Promise<Transaction> {
  const res = await fetch(`/api/transactions/${id}/reject`, { method: "POST" });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Failed to reject");
  }
  return res.json();
}

export function useRejectTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: rejectTransaction,
    onSuccess: () => {
      invalidateTransactionViews(queryClient);
    },
  });
}


