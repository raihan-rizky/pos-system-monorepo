import type { CorrectionPreview, CorrectionResult, ShoppingRequestCorrectionInput } from "../types/shopping-request-correction";
import type { ShoppingRequestCorrectionEditor } from "../repositories/shopping-request-correction-editor";

export type CorrectionHistoryEntry = { id: string; actorName: string | null; createdAt: string; reason: string; preview: CorrectionPreview };

async function correctionRequest<T>(id: string, suffix = "", input?: ShoppingRequestCorrectionInput): Promise<T> {
  const response = await fetch(`/api/suppliers/shopping-requests/${encodeURIComponent(id)}/correction${suffix}`, {
    cache: "no-store",
    ...(input ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || "Koreksi belum dapat diproses. Muat ulang dan coba lagi.");
  return payload.data;
}
export const getCorrectionEditor = (id: string) => correctionRequest<ShoppingRequestCorrectionEditor>(id);
export const previewCorrection = (id: string, input: ShoppingRequestCorrectionInput) => correctionRequest<CorrectionPreview>(id, "/preview", input);
export const saveCorrection = (id: string, input: ShoppingRequestCorrectionInput) => correctionRequest<CorrectionResult>(id, "", input);
export const getCorrectionHistory = (id: string) => correctionRequest<CorrectionHistoryEntry[]>(id, "/history");
