import { deleteShoppingRequestRecord, previewShoppingRequestDeletionRecord } from "../repositories/shopping-request-deletion-repository";
import type { ShoppingRequestActor } from "../types/shopping-request";
import { ShoppingRequestDeletionError } from "./shopping-request-deletion-error";

export { ShoppingRequestDeletionError } from "./shopping-request-deletion-error";

export async function previewShoppingRequestDeletion(id: string, actor: ShoppingRequestActor) {
  if (!actor.storeId) throw new ShoppingRequestDeletionError("Toko pengguna tidak tersedia.", 403);
  return previewShoppingRequestDeletionRecord(id, actor.storeId);
}

export async function deleteShoppingRequest(id: string, reason: string, actor: ShoppingRequestActor) {
  if (!actor.storeId) throw new ShoppingRequestDeletionError("Toko pengguna tidak tersedia.", 403);
  const trimmedReason = reason.trim();
  if (!trimmedReason || trimmedReason.length > 500) {
    throw new ShoppingRequestDeletionError("Isi alasan penghapusan maksimal 500 karakter.", 422);
  }
  return deleteShoppingRequestRecord(id, trimmedReason, actor);
}
