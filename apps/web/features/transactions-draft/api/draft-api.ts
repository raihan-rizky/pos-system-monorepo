import type {
  DraftApproveInput,
  DraftCreateInput,
  DraftTransaction,
} from "../types/draft";

export async function createDraft(
  input: DraftCreateInput,
): Promise<DraftTransaction> {
  const res = await fetch("/api/transactions/draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(error.message || "Gagal menyimpan faktur sementara");
  }
  return (await res.json()) as DraftTransaction;
}

export async function approveDraft(
  input: DraftApproveInput,
): Promise<DraftTransaction> {
  const { id, ...body } = input;
  const res = await fetch(`/api/transactions/${id}/approve-draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(error.message || "Gagal menyetujui faktur sementara");
  }
  return (await res.json()) as DraftTransaction;
}

export async function cancelDraft(id: string): Promise<{ id: string }> {
  const res = await fetch(`/api/transactions/${id}/cancel-draft`, {
    method: "POST",
  });
  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(error.message || "Gagal membatalkan faktur sementara");
  }
  return (await res.json()) as { id: string };
}
