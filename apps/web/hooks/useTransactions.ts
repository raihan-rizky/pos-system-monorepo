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

interface CreateTransactionInput {
  items: CartItem[];
  paymentMethod: string;
  amountPaid: number;
  discount?: number;
  note?: string;
  customerName?: string;
}

async function fetchTransactions(): Promise<Transaction[]> {
  const res = await fetch("/api/transactions");
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

export function useCreateTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createTransaction,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
