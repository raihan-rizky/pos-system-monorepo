import { z } from "zod";

import { apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { buildShoppingRequestStockPreview } from "@/features/suppliers/shopping-requests/repositories/shopping-requests-repository";

const previewSchema = z.object({
  rows: z
    .array(
      z.object({
        itemId: z.string().trim().min(1),
        productId: z.string().trim().min(1),
        stockMode: z.enum(["GROUP_STOCK", "PRODUCT_ONLY"]),
        quantity: z.number().nonnegative(),
      }),
    )
    .min(1)
    .max(100),
});

export async function POST(request: Request) {
  try {
    const user = await requirePermission("supplier", "read");
    const parsed = previewSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);
    const data = await buildShoppingRequestStockPreview(
      user.storeId || "store-main",
      parsed.data.rows,
    );
    return Response.json({ data });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof Error) {
      if (error.message === "PRODUCT_NOT_FOUND") {
        return apiError("Produk tidak ditemukan atau sudah tidak aktif", 404, {
          code: "NotFound",
        });
      }
      if (
        error.message === "INVALID_CONVERSION" ||
        error.message === "GROUP_NOT_FOUND"
      ) {
        return apiError(
          "Konversi unit perlu ditinjau sebelum memakai Stok Bersama",
          422,
          { code: "ValidationError" },
        );
      }
    }
    return apiError("Gagal membuat preview perubahan stok", 500, {
      code: "InternalError",
    });
  }
}
