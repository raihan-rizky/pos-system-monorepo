"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchInternalUseRecap } from "../api/internal-use-recap-api";
import type { InternalUseRecapPeriod } from "../types";

export function useInternalUseRecap(params: {
  period: InternalUseRecapPeriod;
  date: string;
}) {
  return useQuery({
    queryKey: ["internal-use-recap", params],
    queryFn: () => fetchInternalUseRecap(params),
    staleTime: 60_000,
  });
}
