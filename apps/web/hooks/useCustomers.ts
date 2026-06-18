"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import type { CustomerType } from "@/lib/customers";

// ─── Types ───────────────────────────────────────────────────────────────────

export type { CustomerType } from "@/lib/customers";

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  address: string | null;
  type: CustomerType;
  notes: string | null;
  totalSpent: number;
  totalOrders: number;
  totalDebt: number;
  loyaltyPoint: number;
  lastVisitAt: string | null;
  createdAt: string;
}

export interface CustomerDetail extends Customer {
  transactions: {
    id: string;
    invoiceNumber: string;
    total: number;
    amountPaid: number;
    paymentMethod: string;
    status: string;
    isJobOrder: boolean;
    productionStatus: string | null;
    estimatedDoneAt: string | null;
    createdAt: string;
    items: { productName: string; quantity: number; subtotal: number }[];
  }[];
}

export interface PaginatedCustomers {
  data: Customer[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface CustomerListParams {
  search?: string;
  type?: CustomerType | "";
  hasDebt?: boolean;
  page?: number;
  limit?: number;
  enabled?: boolean;
}

export interface CreateCustomerInput {
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  address?: string;
  type?: CustomerType;
  notes?: string;
}

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

// ─── API Calls ───────────────────────────────────────────────────────────────

async function fetchCustomers(
  params: CustomerListParams
): Promise<PaginatedCustomers> {
  const sp = new URLSearchParams();
  if (params.search) sp.set("search", params.search);
  if (params.type) sp.set("type", params.type);
  if (params.hasDebt) sp.set("hasDebt", "true");
  sp.set("page", String(params.page ?? 1));
  sp.set("limit", String(params.limit ?? 20));

  const res = await fetch(`/api/customers?${sp.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch customers");
  return res.json();
}

async function fetchCustomerDetail(id: string): Promise<CustomerDetail> {
  const res = await fetch(`/api/customers/${id}`);
  if (!res.ok) throw new Error("Failed to fetch customer");
  return res.json();
}

async function createCustomer(input: CreateCustomerInput): Promise<Customer> {
  const res = await fetch("/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json();
    throw Object.assign(new Error(err.message ?? "Failed to create customer"), {
      status: res.status,
      data: err,
    });
  }
  return res.json();
}

async function updateCustomer(
  id: string,
  input: UpdateCustomerInput
): Promise<Customer> {
  const res = await fetch(`/api/customers/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json();
    throw Object.assign(new Error(err.message ?? "Failed to update customer"), {
      status: res.status,
      data: err,
    });
  }
  return res.json();
}

async function deleteCustomer(id: string): Promise<void> {
  const res = await fetch(`/api/customers/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Failed to delete customer");
}

async function fetchCustomerDpTransactions(id: string) {
  const res = await fetch(`/api/customers/${id}/dp-transactions`);
  if (!res.ok) throw new Error("Failed to fetch DP transactions");
  return res.json();
}

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useCustomers(params: CustomerListParams = {}) {
  return useQuery({
    queryKey: ["customers", params],
    queryFn: () => fetchCustomers(params),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    enabled: params.enabled,
  });
}

export function useCustomerDetail(id: string | null) {
  return useQuery({
    queryKey: ["customers", id],
    queryFn: () => fetchCustomerDetail(id!),
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

export function useCustomerDpTransactions(id: string | null) {
  return useQuery({
    queryKey: ["customers", id, "dp-transactions"],
    queryFn: () => fetchCustomerDpTransactions(id!),
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

export function useCreateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

export function useUpdateCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & UpdateCustomerInput) =>
      updateCustomer(id, input),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.setQueryData(["customers", updated.id], (old: CustomerDetail | undefined) =>
        old ? { ...old, ...updated } : old
      );
    },
  });
}

export function useDeleteCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}

// ─── Debt Payment ────────────────────────────────────────────────────────────

export interface PayDebtInput {
  customerId: string;
  amount: number;
  paymentMethod?: string;
  note?: string;
}

async function payDebt(input: PayDebtInput): Promise<{ success: boolean; customer: Partial<Customer> }> {
  const { customerId, ...body } = input;
  const res = await fetch(`/api/customers/${customerId}/pay-debt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw Object.assign(new Error(err.message ?? "Failed to pay debt"), {
      status: res.status,
      data: err,
    });
  }
  return res.json();
}

export function usePayDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: payDebt,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customers", variables.customerId] });
    },
  });
}

export interface PayTransactionDebtInput {
  transactionId: string;
  customerId?: string;
  amount: number;
  paymentMethod?: string;
  note?: string;
}

async function payTransactionDebt(input: PayTransactionDebtInput) {
  const { transactionId, customerId: _customerId, ...body } = input;
  const res = await fetch(`/api/transactions/${transactionId}/pay-debt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json();
    throw Object.assign(new Error(err.message ?? "Failed to pay transaction debt"), {
      status: res.status,
      data: err,
    });
  }
  return res.json();
}

export function usePayTransactionDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: payTransactionDebt,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      if (variables.customerId) {
        qc.invalidateQueries({ queryKey: ["customers", variables.customerId] });
        qc.invalidateQueries({ queryKey: ["customers", variables.customerId, "dp-transactions"] });
      }
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
