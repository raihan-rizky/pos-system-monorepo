"use client";

import { useQuery } from "@tanstack/react-query";
import type { DashboardData } from "../types";

async function fetchDashboard(): Promise<DashboardData> {
  const response = await fetch("/api/dashboard");
  if (!response.ok) {
    throw new Error("Failed to fetch dashboard");
  }
  return response.json() as Promise<DashboardData>;
}

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: ["dashboard"],
    queryFn: fetchDashboard,
    refetchInterval: 30_000,
    placeholderData: (previous) => previous,
  });
}
