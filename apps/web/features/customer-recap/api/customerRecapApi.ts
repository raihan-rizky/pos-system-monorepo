import type {
  ApiEnvelope,
  CustomerDetailRecapData,
  CustomerRecapData,
  CustomerRecapQuery,
} from "../types/customer-recap";
import type { CustomerRecapExportData } from "../helpers/export-core";

async function readEnvelope<T>(
  response: Response,
  fallbackMessage: string,
): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | Partial<ApiEnvelope<T>>
    | null;

  if (!response.ok) {
    throw new Error(payload?.message || fallbackMessage);
  }

  if (!payload || payload.data === undefined) {
    throw new Error(fallbackMessage);
  }

  return payload.data;
}

function queryString(input: CustomerRecapQuery): string {
  return new URLSearchParams({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
  }).toString();
}

export const customerRecapApi = {
  async getPageRecap(input: CustomerRecapQuery): Promise<CustomerRecapData> {
    const response = await fetch(`/api/customers/recap?${queryString(input)}`);
    return readEnvelope<CustomerRecapData>(
      response,
      "Failed to load customer recap",
    );
  },

  async getCustomerRecap(
    customerId: string,
    input: CustomerRecapQuery,
  ): Promise<CustomerDetailRecapData> {
    const response = await fetch(
      `/api/customers/${customerId}/recap?${queryString(input)}`,
    );
    return readEnvelope<CustomerDetailRecapData>(
      response,
      "Failed to load customer recap",
    );
  },

  async getExportRecap(input: CustomerRecapQuery): Promise<CustomerRecapExportData> {
    const response = await fetch(
      `/api/customers/recap/export?${queryString(input)}`,
      { cache: "no-store" },
    );
    return readEnvelope<CustomerRecapExportData>(
      response,
      "Gagal memuat data ekspor rekap pelanggan",
    );
  },
};
