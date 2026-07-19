import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import {
  apiError,
  apiList,
  apiValidationError,
  buildPaginationMeta,
  parsePagination,
} from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import {
  createShoppingRequest,
  listShoppingRequestsPage,
  ShoppingRequestValidationError,
} from "@/features/suppliers/shopping-requests/services/shopping-requests-service";
import { SHOPPING_REQUEST_STATUSES } from "@/features/suppliers/shopping-requests/types/shopping-request";

const log = getLogger("api:suppliers:shopping-requests");

const createSchema = z.object({
  supplierId: z.string().trim().min(1, "Supplier wajib dipilih"),
  requestedByName: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        productId: z.string().trim().min(1),
        requestedQty: z.number().positive(),
        stockMode: z.enum(["GROUP_STOCK", "PRODUCT_ONLY"]),
      }),
    )
    .min(1, "At least one item is required"),
});

export async function GET(request: Request) {
  try {
    const user = await requirePermission("supplier", "read");
    if (!user.storeId) {
      return apiError("Toko pengguna tidak tersedia", 403, {
        code: "Forbidden",
      });
    }
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    });
    const q = searchParams.get("q")?.trim() || undefined;
    const rawStatus = searchParams.get("status");
    const status = SHOPPING_REQUEST_STATUSES.includes(
      rawStatus as (typeof SHOPPING_REQUEST_STATUSES)[number],
    )
      ? (rawStatus as (typeof SHOPPING_REQUEST_STATUSES)[number])
      : undefined;
    const supplierId = searchParams.get("supplierId") || undefined;

    const result = await listShoppingRequestsPage({
      storeId: user.storeId,
      q,
      status,
      supplierId,
      skip,
      take: limit,
    });

    return apiList(
      result.requests,
      buildPaginationMeta(result.total, page, limit),
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("shopping_requests.list.failed", { error });
    return apiError("Failed to fetch shopping requests", 500, {
      code: "InternalError",
    });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("supplier", "create");
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await createShoppingRequest(
      {
        supplierId: parsed.data.supplierId,
        requestedByName: parsed.data.requestedByName || user.name || null,
        note: parsed.data.note || null,
        items: parsed.data.items,
      },
      { id: user.id, name: user.name, storeId: user.storeId || "store-main" },
    );

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof ShoppingRequestValidationError) {
      return apiError(error.message, 422, { code: "ValidationError" });
    }

    log.error("shopping_requests.create.failed", { error });
    return apiError("Failed to create shopping request", 500, {
      code: "InternalError",
    });
  }
}
