"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

// Type definitions
export interface CashierShift {
  id: string;
  cashierId: string;
  storeId: string;
  openingBalance: number;
  closingBalance: number | null;
  expectedBalance: number | null;
  discrepancy: number | null;
  status: "OPEN" | "CLOSED";
  note: string | null;
  openedAt: string;
  closedAt: string | null;
  cashier?: { name: string };
}

export interface PaginatedShifts {
  data: CashierShift[];
  total: number;
  page: number;
  totalPages: number;
}

export function useActiveShift() {
  return useQuery({
    queryKey: ["active-shift"],
    queryFn: async (): Promise<CashierShift | null> => {
      const res = await fetch("/api/shifts?active=true");
      if (!res.ok) throw new Error("Failed to fetch active shift");
      const json = await res.json();
      return json.data || null;
    },
  });
}

export function useShiftHistory(page: number = 1, limit: number = 10) {
  return useQuery({
    queryKey: ["shift-history", page, limit],
    queryFn: async (): Promise<PaginatedShifts> => {
      const res = await fetch(`/api/shifts?page=${page}&limit=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch shift history");
      return res.json();
    },
    placeholderData: (prev) => prev,
  });
}

export function useOpenShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { openingBalance: number; note?: string }) => {
      const res = await fetch("/api/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to open shift");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-shift"] });
      queryClient.invalidateQueries({ queryKey: ["shift-history"] });
    },
  });
}

export function useCloseShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { shiftId: string; closingBalance: number; note?: string }) => {
      const res = await fetch("/api/shifts/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to close shift");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-shift"] });
      queryClient.invalidateQueries({ queryKey: ["shift-history"] });
    },
  });
}

export function useUpdateShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; openingBalance?: number; closingBalance?: number; note?: string }) => {
      const res = await fetch("/api/shifts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vars),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update shift");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["active-shift"] });
      queryClient.invalidateQueries({ queryKey: ["shift-history"] });
    },
  });
}
