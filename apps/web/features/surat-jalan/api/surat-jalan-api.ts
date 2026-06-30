import type {
  SuratJalanMarkingStatus,
  SuratJalanProgress,
  SuratJalanReceiptTransaction,
  SuratJalanRecord,
  SuratJalanRemainingItem,
} from "../types/surat-jalan";

export interface SuratJalanBundle {
  transaction: SuratJalanReceiptTransaction & {
    customerType: "UMUM" | "AGEN" | "INDUSTRI" | "PEMERINTAH" | null;
    stockManagedBySuratJalan: boolean;
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

export interface MarkSuratJalanInput {
  suratJalanId: string;
  markingStatus: Exclude<SuratJalanMarkingStatus, "UNMARKED">;
  markingNote?: string | null;
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

export async function markSuratJalan(
  input: MarkSuratJalanInput,
): Promise<SuratJalanRecord> {
  const response = await fetch(`/api/surat-jalan/${input.suratJalanId}/marking`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      markingStatus: input.markingStatus,
      markingNote: input.markingNote ?? null,
    }),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to mark surat jalan");
  }
  return response.json();
}

export async function fetchSuratJalans(limit = 50, offset = 0) {
  const response = await fetch(`/api/surat-jalan?limit=${limit}&offset=${offset}`);
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to fetch surat jalan");
  }
  return response.json();
}
