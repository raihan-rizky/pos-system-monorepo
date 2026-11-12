"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/components/providers/RoleProvider";
import { WAIT_FOR_SESSION_RECOVERY } from "@/lib/auth/session-failure";
import { buildClientMutationId } from "@/lib/offline/offline-core";

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
  pausedAt: string | null;
  pausedDurationSeconds: number;
  cashier?: { name: string };
  isLocalOnly?: boolean;
}

export interface PaginatedShifts {
  data: CashierShift[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export interface ShiftSummary {
  totalShifts: number;
  openShifts: number;
  totalDiscrepancy: number;
  avgDurationMinutes: number | null;
}

export interface CloseShiftSummary {
  shiftId: string;
  openingBalance: number;
  totalCashTransactions: number;
  expectedBalance: number;
}

export function useActiveShift(initialData?: CashierShift | null) {
  const { userId, storeId, isOfflineSession } = useRole();
  return useQuery({
    queryKey: ["active-shift", storeId, userId, isOfflineSession],
    networkMode: "always",
    queryFn: async (): Promise<CashierShift | null> => {
      const { getOfflineActiveShift, rememberActiveShift, offlineDb } = await import("@/lib/offline/offline-db");
      const getLocalShift = () => userId
        ? getOfflineActiveShift({ cashierId: userId, storeId: storeId || "store-main" })
        : Promise.resolve(undefined);
      if (isOfflineSession || (typeof window !== "undefined" && !navigator.onLine)) {
        return (await getLocalShift()) || null;
      }

      try {
        const res = await fetch("/api/shifts?active=true");
        if (res.status >= 500) return (await getLocalShift()) || null;
        if (!res.ok) throw new Error("Failed to fetch active shift");
        const json = await res.json();
        const local = await getLocalShift();
        if (local && !local.openSynced) return local;
        const serverShift = json.data as CashierShift | null;
        if (serverShift && serverShift.cashierId === userId && serverShift.storeId === (storeId || "store-main")) {
          const saved = await offlineDb.offlineShifts.get(serverShift.id);
          if (saved?.status === "CLOSED" && !saved.closeSynced) return local || null;
          await rememberActiveShift(serverShift).catch(() => undefined);
        }
        return serverShift || local || null;
      } catch (error) {
        if (typeof window !== "undefined" && (error instanceof TypeError || !navigator.onLine)) {
          return (await getLocalShift()) || null;
        }
        throw error;
      }
    },
    initialData: isOfflineSession ? undefined : initialData,
    refetchOnWindowFocus: false,
  });
}

export function useShiftHistory(
  page: number = 1,
  limit: number = 10,
  sortBy: string = "openedAt",
  sortOrder: "asc" | "desc" = "desc",
) {
  return useQuery({
    queryKey: ["shift-history", page, limit, sortBy, sortOrder],
    queryFn: async (): Promise<PaginatedShifts> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sortBy,
        sortOrder,
      });
      const res = await fetch(`/api/shifts?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch shift history");
      return res.json();
    },
    placeholderData: (prev) => prev,
  });
}

export function useOpenShift() {
  const queryClient = useQueryClient();
  const { userId, userName, storeId, canPerform, isOfflineSession, isSessionRecovering } = useRole();
  return useMutation({
    networkMode: "always",
    mutationFn: async (vars: { openingBalance: number; note?: string }) => {
      if (isSessionRecovering) throw new Error(WAIT_FOR_SESSION_RECOVERY);
      const { createOfflineShift } = await import("@/lib/offline/offline-db");
      const clientShiftId = `shift-${buildClientMutationId()}`;
      const openLocalShift = () => {
        if (!canPerform("shift", "create")) throw new Error("Anda belum memiliki izin untuk membuka shift.");
        if (!userId) throw new Error("Identitas kasir belum tersedia. Masuk kembali untuk membuka shift offline.");
        return createOfflineShift({ ...vars, clientShiftId, cashierId: userId, cashierName: userName || "Kasir", storeId: storeId || "store-main" });
      };

      if (isOfflineSession || (typeof window !== "undefined" && !navigator.onLine)) {
        return openLocalShift();
      }

      try {
        const res = await fetch("/api/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...vars, clientShiftId, originCashierId: userId, originStoreId: storeId || "store-main" }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message || "Failed to open shift");
        }
        return res.json();
      } catch (error) {
        if (typeof window !== "undefined" && (error instanceof TypeError || !navigator.onLine)) {
          return openLocalShift();
        }
        throw error;
      }
    },
    onSuccess: async (shift) => {
      if (!shift.isLocalOnly && shift.cashierId === userId && shift.storeId === (storeId || "store-main")) {
        const { rememberActiveShift } = await import("@/lib/offline/offline-db");
        await rememberActiveShift({ ...shift, openingBalance: Number(shift.openingBalance) }).catch(() => undefined);
      }
      queryClient.setQueryData(["active-shift", storeId, userId, isOfflineSession], shift);
      queryClient.invalidateQueries({ queryKey: ["active-shift"] });
      queryClient.invalidateQueries({ queryKey: ["shift-history"] });
      queryClient.invalidateQueries({ queryKey: ["shift-summary"] });
    },
  });
}

export function useCloseShiftSummary(
  shiftId: string | null | undefined,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: ["close-shift-summary", shiftId],
    queryFn: async (): Promise<CloseShiftSummary> => {
      if (!shiftId) throw new Error("Shift ID is required");
      const params = new URLSearchParams({ shiftId });
      const res = await fetch(`/api/shifts/close?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to fetch close shift summary");
      }
      const json = await res.json();
      return json.data;
    },
    enabled: enabled && !!shiftId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useCloseShift() {
  const queryClient = useQueryClient();
  const { userId, storeId, canPerform, isOfflineSession, isSessionRecovering } = useRole();
  return useMutation({
    networkMode: "always",
    mutationFn: async (vars: { shiftId: string; closingBalance: number; note?: string }) => {
      if (isSessionRecovering) throw new Error(WAIT_FOR_SESSION_RECOVERY);
      const { offlineDb, closeOfflineShift } = await import("@/lib/offline/offline-db");
      const local = await offlineDb.offlineShifts.get(vars.shiftId);
      if (local && userId && local.cashierId === userId && local.storeId === (storeId || "store-main")) {
        if (!canPerform("shift", "update")) throw new Error("Anda belum memiliki izin untuk menutup shift.");
        await closeOfflineShift(vars.shiftId, { cashierId: userId, storeId: storeId || "store-main" }, vars.closingBalance, vars.note);
        window.dispatchEvent(new CustomEvent("pos-offline-sync-requested"));
        return { ...local, status: "CLOSED", closingBalance: vars.closingBalance };
      }
      if (isOfflineSession || (typeof window !== "undefined" && !navigator.onLine)) {
        throw new Error("Data shift belum tersedia di perangkat ini. Hubungkan perangkat untuk menutup shift.");
      }
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
      queryClient.invalidateQueries({ queryKey: ["close-shift-summary"] });
      queryClient.invalidateQueries({ queryKey: ["shift-summary"] });
    },
  });
}

export function useUpdateShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; openingBalance?: number; closingBalance?: number; note?: string }) => {
      const { id, ...body } = vars;
      const res = await fetch(`/api/shifts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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
      queryClient.invalidateQueries({ queryKey: ["shift-summary"] });
    },
  });
}

export function useShiftSummary() {
  return useQuery({
    queryKey: ["shift-summary"],
    queryFn: async (): Promise<ShiftSummary> => {
      const res = await fetch("/api/shifts/summary");
      if (!res.ok) throw new Error("Failed to fetch shift summary");
      const json = await res.json();
      return json.data;
    },
    staleTime: 30_000,
  });
}
