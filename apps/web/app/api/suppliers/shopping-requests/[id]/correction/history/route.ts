import { listShoppingRequestCorrectionHistory } from "@/features/suppliers/shopping-requests/services/shopping-request-correction-service";
import { correctionErrorResponse, requireCorrectionHistoryActor } from "../route-helpers";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const actor = await requireCorrectionHistoryActor();
    const { id } = await params;
    const data = await listShoppingRequestCorrectionHistory(id, actor);
    return Response.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return correctionErrorResponse(error);
  }
}
