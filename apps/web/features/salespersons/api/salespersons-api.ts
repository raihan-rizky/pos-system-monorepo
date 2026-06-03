"use client";

export interface Salesperson {
  id: string;
  name: string;
  isActive: boolean;
  storeId: string;
  createdAt: string;
  _count?: {
    transactions: number;
  };
}

interface SalespersonCollectionResponse {
  data?: Salesperson[];
}

export interface SaveSalespersonInput {
  name: string;
  isActive: boolean;
}

export interface SalespersonTransaction {
  id: string;
  invoiceNumber: string | null;
  draftNumber?: string | null;
  total: number;
  paymentMethod: string;
  customerName: string | null;
  status: string;
  createdAt: string;
}

interface SalespersonTransactionsResponse {
  data?: SalespersonTransaction[];
}

export class SalespersonsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SalespersonsApiError";
    this.status = status;
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed: ${response.status}`;

  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message || fallback;
  } catch {
    return fallback;
  }
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!response.ok) {
    throw new SalespersonsApiError(
      await readErrorMessage(response),
      response.status
    );
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function listSalespersons(
  signal?: AbortSignal
): Promise<Salesperson[]> {
  const response = await requestJson<SalespersonCollectionResponse>(
    "/api/salespersons?storeId=store-main",
    { signal }
  );

  return response.data ?? [];
}

export async function createSalesperson(
  input: SaveSalespersonInput
): Promise<Salesperson> {
  return requestJson<Salesperson>("/api/salespersons", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSalesperson(
  id: string,
  input: Partial<SaveSalespersonInput>
): Promise<Salesperson> {
  return requestJson<Salesperson>(`/api/salespersons/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function listSalespersonTransactions(
  salespersonId: string,
  signal?: AbortSignal
): Promise<SalespersonTransaction[]> {
  const searchParams = new URLSearchParams({
    salespersonId,
    limit: "20",
  });
  const response = await requestJson<SalespersonTransactionsResponse>(
    `/api/transactions?${searchParams.toString()}`,
    { signal }
  );

  return response.data ?? [];
}
