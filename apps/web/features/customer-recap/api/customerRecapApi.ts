import type {
  ApiEnvelope,
  CustomerDetailRecapData,
  CustomerRecapData,
  CustomerRecapQuery,
} from "../types/customer-recap";

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

function getBaseUrl() {
  if (typeof window !== "undefined") return ""; // browser should use relative url
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000"; // fallback for SSR in dev
}

export const customerRecapApi = {
  async getPageRecap(input: CustomerRecapQuery): Promise<CustomerRecapData> {
    const response = await fetch(`${getBaseUrl()}/api/customers/recap?${queryString(input)}`);
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
      `${getBaseUrl()}/api/customers/${customerId}/recap?${queryString(input)}`,
    );
    return readEnvelope<CustomerDetailRecapData>(
      response,
      "Failed to load customer recap",
    );
  },
};
