import { db } from "@pos/db";
import type { ShoppingRequestActor } from "../types/shopping-request";
import { loadShoppingRequestCorrectionEditor } from "../repositories/shopping-request-correction-editor";
import { planShoppingRequestCorrection } from "../repositories/shopping-request-correction-plan";
import { commitShoppingRequestCorrectionRecord } from "../repositories/shopping-request-correction-repository";
import type { ShoppingRequestCorrectionInput } from "../types/shopping-request-correction";
import { ShoppingRequestCorrectionError } from "./shopping-request-correction-error";
import { sendRolePushEvent } from "@/lib/push-events";

export async function commitShoppingRequestCorrection(id: string, data: ShoppingRequestCorrectionInput, actor: ShoppingRequestActor) {
  if (!actor.storeId) throw new ShoppingRequestCorrectionError("Toko pengguna belum tersedia.", 403);
  const result = await db.$transaction((tx) => commitShoppingRequestCorrectionRecord(tx, { requestId: id, actor, data }), { timeout: 60000 });
  void sendRolePushEvent({
    eventName: "shopping_request.corrected", storeId: actor.storeId, roles: ["OWNER"], featureKey: "shoppingRequests", excludeUserIds: [actor.id],
    payload: { title: "Daftar belanja diubah", body: `${actor.name ?? "Pengguna"} memperbarui daftar belanja.`, url: `/suppliers?tab=shopping-requests&shoppingRequestId=${encodeURIComponent(id)}`, tag: `shopping-request-correction:${result.correctionId}` },
  }).catch(() => undefined);
  return result;
}

export async function listShoppingRequestCorrectionHistory(id: string, actor: ShoppingRequestActor) {
  if (!actor.storeId) throw new ShoppingRequestCorrectionError("Toko pengguna belum tersedia.", 403);
  const rows = await db.shoppingRequestCorrection.findMany({
    where: { storeId: actor.storeId, shoppingRequestId: id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, actorName: true, createdAt: true, reason: true, preview: true },
  });
  return rows.map((row) => ({ id: row.id, actorName: row.actorName, createdAt: row.createdAt.toISOString(), reason: row.reason, preview: row.preview }));
}

export async function getShoppingRequestCorrectionEditor(id: string, actor: ShoppingRequestActor) {
  if (!actor.storeId) throw new ShoppingRequestCorrectionError("Toko pengguna belum tersedia.", 403);
  return db.$transaction((tx) => loadShoppingRequestCorrectionEditor(tx, { storeId: actor.storeId, requestId: id }), { timeout: 15000 });
}

export async function previewShoppingRequestCorrection(id: string, data: ShoppingRequestCorrectionInput, actor: ShoppingRequestActor) {
  if (!actor.storeId) throw new ShoppingRequestCorrectionError("Toko pengguna belum tersedia.", 403);
  return db.$transaction(async (tx) => (await planShoppingRequestCorrection(tx, { storeId: actor.storeId, requestId: id, data })).preview, { timeout: 15000 });
}
