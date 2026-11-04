import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  deleteShoppingRequest,
  previewShoppingRequestDeletion,
  ShoppingRequestDeletionError,
} from "@/features/suppliers/shopping-requests/services/shopping-request-deletion-service";

export const dynamic = "force-dynamic";
const log = getLogger("api:suppliers:shopping-requests:deletion");

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown): Response {
  const authError = handleAuthError(error);
  if (authError) return authError;
  if (error instanceof ShoppingRequestDeletionError) {
    return apiError(error.message, error.status, { code: error.status === 404 ? "NotFound" : "Conflict" });
  }
  log.error("shopping_requests.deletion.failed", { error });
  return apiError("Gagal memproses penghapusan daftar. Muat ulang dan coba lagi.", 500, { code: "InternalError" });
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requirePermission("supplier.shopping_request.delete", "delete");
    const { id } = await params;
    const actor = { id: user.id, name: user.name, storeId: user.storeId ?? "" };
    return Response.json({ data: await previewShoppingRequestDeletion(id, actor) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requirePermission("supplier.shopping_request.delete", "delete");
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("reason" in body) || typeof body.reason !== "string") {
      return apiError("Isi alasan penghapusan.", 422, { code: "ValidationError" });
    }
    const { id } = await params;
    const actor = { id: user.id, name: user.name, storeId: user.storeId ?? "" };
    return Response.json({ data: await deleteShoppingRequest(id, body.reason, actor) });
  } catch (error) {
    return errorResponse(error);
  }
}
