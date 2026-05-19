"use client";

import { useQuery } from "@tanstack/react-query";

interface SalespersonOption {
  id: string;
  name: string;
}

async function fetchSalespersons(): Promise<SalespersonOption[]> {
  const res = await fetch("/api/salespersons?storeId=store-main&activeOnly=true");
  if (!res.ok) throw new Error(`Failed to fetch salespersons: ${res.status}`);
  const json = (await res.json()) as { data: SalespersonOption[] };
  return json.data;
}

/**
 * Shared hook for salesperson list.
 * Uses a long staleTime (5 min) since salesperson data rarely changes,
 * avoiding redundant network requests on every PaymentModal open.
 */
export function useSalespersons() {
  return useQuery({
    queryKey: ["salespersons"],
    queryFn: fetchSalespersons,
    staleTime: 5 * 60_000, // 5 minutes
  });
}
