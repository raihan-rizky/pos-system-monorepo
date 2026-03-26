"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { CartItem } from "./useCart";

export interface Transaction {
  id: string;
  invoiceNumber: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  amountPaid: number;
  change: number;
  customerName: string | null;
  note: string | null;
  status: string;
  createdAt: string;
  items: {
    id: string;
    productName: string;
    size: string | null;
    material: string | null;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }[];
}

export interface PaginatedTransactions {
  data: Transaction[];
  total: number;
  page: number;
  totalPages: number;
}

export interface TransactionHistoryParams {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  page?: number;
}

interface CreateTransactionInput {
  items: CartItem[];
  paymentMethod: string;
  amountPaid: number;
  discount?: number;
  note?: string;
  customerName?: string;
}

async function fetchTransactions(): Promise<Transaction[]> {
  const res = await fetch("/api/transactions?limit=50");
  if (!res.ok) throw new Error("Failed to fetch transactions");
  const json = await res.json();
  return json.data ?? json;
}

async function fetchTransactionHistory(
  params: TransactionHistoryParams
): Promise<PaginatedTransactions> {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set("search", params.search);
  if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
  if (params.dateTo) searchParams.set("dateTo", params.dateTo);
  if (params.categoryId) searchParams.set("categoryId", params.categoryId);
  searchParams.set("page", String(params.page || 1));
  searchParams.set("limit", "10");

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
    placeholderData: (prev) => prev,
  });
}

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

