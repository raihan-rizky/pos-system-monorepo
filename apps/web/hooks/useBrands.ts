"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface Brand {
  id: string;
  storeId: string;
  name: string;
  normalizedName: string;
  createdAt: string;
  updatedAt: string;
}

async function fetchBrands(): Promise<Brand[]> {
  const res = await fetch("/api/brands");
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.message ?? "Gagal memuat merek");
  }
  const json = (await res.json()) as { data: Brand[] };
  return json.data;
}

async function createBrand(input: { name: string }): Promise<Brand> {
  const res = await fetch("/api/brands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.message ?? "Gagal menambah merek");
  }
  return res.json();
}

export function useBrands() {
  return useQuery({
    queryKey: ["brands"],
    queryFn: fetchBrands,
    staleTime: 60_000,
  });
}

export function useCreateBrand() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBrand,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["brands"] });
    },
  });
}
