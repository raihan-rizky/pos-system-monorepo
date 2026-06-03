import type { CustomerType as DbCustomerType } from "@pos/db";

export const CUSTOMER_TYPES = [
  "UMUM",
  "AGEN",
  "INDUSTRI",
  "PEMERINTAH",
] as const;

export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  UMUM: "UMUM",
  AGEN: "AGEN",
  INDUSTRI: "INDUSTRI",
  PEMERINTAH: "PEMERINTAH",
};

export function toDbCustomerType(type: CustomerType): DbCustomerType {
  return type as DbCustomerType;
}
