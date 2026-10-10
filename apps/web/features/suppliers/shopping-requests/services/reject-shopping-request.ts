import { db } from "@pos/db";
import type { ShoppingRequestActor } from "../types/shopping-request";
import { FinalApprovalError } from "./final-approval-error";

export async function rejectShoppingRequest(
  id: string,
  reason: string,
  actor: ShoppingRequestActor,
) {
  const trimmedReason = reason.trim();
  if (trimmedReason.length < 3) throw new FinalApprovalError("Tulis alasan penolakan.");
  const rejectedAt = new Date();
  const claim = await db.shoppingRequest.updateMany({
    where: { id, storeId: actor.storeId, status: "REQUESTED", approvalFlowVersion: 2 },
    data: {
      status: "REJECTED",
      rejectedAt,
      rejectedById: actor.id,
      rejectedByName: actor.name,
      rejectionReason: trimmedReason,
    },
  });
  if (claim.count !== 1) throw new FinalApprovalError("Daftar belanja sudah diproses. Muat ulang data terbaru.", 409);
  return { id, status: "REJECTED" as const, rejectedAt: rejectedAt.toISOString(), rejectionReason: trimmedReason };
}
