import { parseShoppingRequestCorrection } from "@/features/suppliers/shopping-requests/helpers/shopping-request-correction-input";
import { previewShoppingRequestCorrection } from "@/features/suppliers/shopping-requests/services/shopping-request-correction-service";
import { correctionErrorResponse, requireCorrectionActor } from "../route-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const actor = await requireCorrectionActor();
    const data = parseShoppingRequestCorrection(await request.json().catch(() => null));
    const { id } = await params;
    const preview = await previewShoppingRequestCorrection(id, data, actor);
    return Response.json({ data: preview }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return correctionErrorResponse(error);
  }
}
