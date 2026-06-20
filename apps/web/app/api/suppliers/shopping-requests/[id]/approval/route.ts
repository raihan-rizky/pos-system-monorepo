import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import {
  approveShoppingRequest,
  ShoppingRequestNotFoundError,
  ShoppingRequestValidationError,
} from "@/features/suppliers/shopping-requests/services/shopping-requests-service";

const log = getLogger("api:suppliers:shopping-requests:approval");

export const dynamic = "force-dynamic";

const approveSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        approvedQty: z.number().nonnegative(),
      }),
    )
    .min(1, "At least one item is required"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("supplier", "update");
    const { id } = await params;
    const parsed = approveSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await approveShoppingRequest(
      id,
      { items: parsed.data.items },
      { id: user.id, name: user.name, storeId: user.storeId || "store-main" },
    );
    return Response.json({ data: result });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof ShoppingRequestNotFoundError) {
      return apiError("Shopping request not found", 404, { code: "NotFound" });
    }
    if (error instanceof ShoppingRequestValidationError) {
      return apiError(error.message, 409, { code: "Conflict" });
    }

    log.error("shopping_requests.approve.failed", { error });
    return apiError("Failed to approve shopping request", 500, {
      code: "InternalError",
    });
  }
}
