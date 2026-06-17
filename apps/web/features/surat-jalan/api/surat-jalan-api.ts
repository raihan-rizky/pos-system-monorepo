import type {
  SuratJalanProgress,
  SuratJalanRecord,
  SuratJalanRemainingItem,
} from "../types/surat-jalan";

export interface SuratJalanBundle {
  transaction: {
    id: string;
    invoiceNumber: string | null;
    status: string;
    customerName: string | null;
    customerId: string | null;
    customerType: "UMUM" | "AGEN" | "INDUSTRI" | "PEMERINTAH" | null;
    createdAt: string;
    total: number;
    paymentMethod: string;
    amountPaid: number;
    change: number;
    note: string | null;
    salesName: string | null;
    salesperson: { name: string } | null;
    stockManagedBySuratJalan: boolean;
    items: {
      id: string;
      printingServiceId: string | null;
      productName: string;
      size: string | null;
      material: string | null;
      quantity: number;
      unit: string | null;
      unitPrice: number;
      subtotal: number;
    }[];
  };
  eligibility: { eligible: true; reason: null } | {
    eligible: false;
    reason: string;
  };
  progress: SuratJalanProgress;
  remainingItems: SuratJalanRemainingItem[];
  suratJalan: SuratJalanRecord[];
}

export interface CreateSuratJalanInput {
  transactionId: string;
  recipientName: string;
  quantities: Record<string, number>;
  keterangan: Record<string, string>;
  note?: string | null;
}

export async function fetchSuratJalanBundle(
  transactionId: string,
): Promise<SuratJalanBundle> {
  const response = await fetch(`/api/transactions/${transactionId}/surat-jalan`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch surat jalan");
  }
  const json = (await response.json()) as { data: SuratJalanBundle };
  return json.data;
}

export async function createSuratJalan(
  input: CreateSuratJalanInput,
): Promise<SuratJalanRecord> {
  const { transactionId, ...body } = input;
  const response = await fetch(`/api/transactions/${transactionId}/surat-jalan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to create surat jalan");
  }
  return response.json();
}

export async function approveSuratJalan(
  suratJalanId: string,
): Promise<SuratJalanRecord> {
  const response = await fetch(`/api/surat-jalan/${suratJalanId}/approval`, {
    method: "POST",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to approve surat jalan");
  }
  return response.json();
}
