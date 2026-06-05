"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { customerRecapApi } from "../api/customerRecapApi";
import type { CustomerRecapQuery } from "../types/customer-recap";

export function customerRecapQueryOptions(input: CustomerRecapQuery) {
  return {
    queryKey: ["customer-recap", input.dateFrom, input.dateTo] as const,
    queryFn: () => customerRecapApi.getPageRecap(input),
    staleTime: 60_000,
  };
}

export function customerDetailRecapQueryOptions(
  customerId: string,
  input: CustomerRecapQuery,
) {
  return {
    queryKey: ["customer-recap", customerId, input.dateFrom, input.dateTo] as const,
    queryFn: () => customerRecapApi.getCustomerRecap(customerId, input),
    staleTime: 60_000,
  };
}

export function useCustomerRecap(input: CustomerRecapQuery) {
  return useSuspenseQuery(customerRecapQueryOptions(input));
}

export function useCustomerDetailRecap(
  customerId: string,
  input: CustomerRecapQuery,
) {
  return useSuspenseQuery(customerDetailRecapQueryOptions(customerId, input));
}
