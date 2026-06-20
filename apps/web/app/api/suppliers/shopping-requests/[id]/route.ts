import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import {
  cancelShoppingRequest,
  getShoppingRequestOrThrow,
  ShoppingRequestNotFoundError,
} from "@/features/suppliers/shopping-requests/services/shopping-requests-service";

const log = getLogger("api:suppliers:shopping-requests:detail");

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requirePermission("supplier", "read");
    const { id } = await params;
    const result = await getShoppingRequestOrThrow(id);
    return Response.json({ data: result });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof ShoppingRequestNotFoundError) {
      return apiError("Shopping request not found", 404, { code: "NotFound" });
    }

    log.error("shopping_requests.detail.failed", { error });
    return apiError("Failed to fetch shopping request", 500, {
      code: "InternalError",
    });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("supplier", "update");
    const { id } = await params;
    const result = await cancelShoppingRequest(id, {
      id: user.id,
      name: user.name,
      storeId: user.storeId || "store-main",
    });
    return Response.json({ data: result });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof ShoppingRequestNotFoundError) {
      return apiError("Shopping request not found", 404, { code: "NotFound" });
    }

    log.error("shopping_requests.cancel.failed", { error });
    return apiError("Failed to cancel shopping request", 500, {
      code: "InternalError",
    });
  }
}
