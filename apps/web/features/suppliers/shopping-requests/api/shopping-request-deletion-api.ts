export interface ShoppingRequestDeletionPreview {
  id: string;
  number: string;
  name: string;
  movements: Array<{ productId: string; productName: string; stockGroupId: string | null; baseQuantity: number; unit: string | null }>;
}

async function resultOrError<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || fallback);
  return payload.data as T;
}

export async function getShoppingRequestDeletionPreview(id: string): Promise<ShoppingRequestDeletionPreview> {
  const response = await fetch(`/api/suppliers/shopping-requests/${encodeURIComponent(id)}/deletion`);
  return resultOrError(response, "Gagal memuat dampak penghapusan daftar.");
}

export async function deleteShoppingRequest(id: string, reason: string): Promise<{ id: string; status: "CANCELLED" }> {
  const response = await fetch(`/api/suppliers/shopping-requests/${encodeURIComponent(id)}/deletion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return resultOrError(response, "Gagal menghapus daftar belanja.");
}
