import { db } from "@pos/db";
import { NextResponse } from "next/server";
import { readProductImageFromR2 } from "@/features/upload/server/r2-media-storage";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("product", "read");
    const { id } = await params;
    const product = await db.product.findFirst({
      where: { id, storeId: user.storeId || "store-main" },
      select: { imageUrl: true },
    });
    const image = product?.imageUrl ? await readProductImageFromR2(product.imageUrl) : null;
    if (!image) return apiError("Foto produk belum tersedia.", 404);

    return new NextResponse(image.body, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return handleAuthError(error) ?? apiError("Foto produk belum dapat dimuat. Coba lagi.", 503);
  }
}
