import { getShoppingRequestCorrectionEditor, commitShoppingRequestCorrection } from "@/features/suppliers/shopping-requests/services/shopping-request-correction-service";
import { parseShoppingRequestCorrection } from "@/features/suppliers/shopping-requests/helpers/shopping-request-correction-input";
import { correctionErrorResponse, requireCorrectionActor } from "./route-helpers";
import { ShoppingRequestCorrectionError } from "@/features/suppliers/shopping-requests/services/shopping-request-correction-error";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const actor = await requireCorrectionActor();
    const { id } = await params;
    const data = await getShoppingRequestCorrectionEditor(id, actor);
    return Response.json({ data }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return correctionErrorResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const actor = await requireCorrectionActor();
    const data = parseShoppingRequestCorrection(await request.json().catch(() => null));
    if (!data.expectedPreviewVersion) throw new ShoppingRequestCorrectionError("Tinjau dampak perubahan terlebih dahulu.", 422);
    const { id } = await params;
    const result = await commitShoppingRequestCorrection(id, data, actor);
    return Response.json({ data: result }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return correctionErrorResponse(error);
  }
}
