import { db } from "@pos/db";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { CATEGORY_LABELS_ID, normalizeExpenseCategoryName } from "@/features/keuangan/helpers/category-meta";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requirePermission("expense", "read");
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const data = await db.customExpenseCategory.findMany({
      where: { storeId: user.storeId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ data });
  } catch (error) {
    return handleAuthError(error) ?? apiError("Kategori belum dapat dimuat.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("expense", "create");
    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const body = await request.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.normalize("NFKC").trim().replace(/\s+/gu, " ") : "";
    const normalizedName = normalizeExpenseCategoryName(name);
    if (!name || name.length > 50) return apiError("Isi nama kategori dengan maksimal 50 karakter.", 422);
    if (Object.values(CATEGORY_LABELS_ID).some((label) => normalizeExpenseCategoryName(label) === normalizedName)) {
      return apiError("Kategori tersebut sudah tersedia. Pilih dari daftar kategori.", 409);
    }
    const data = await db.customExpenseCategory.create({
      data: { storeId: user.storeId, name, normalizedName },
      select: { id: true, name: true },
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      return apiError("Kategori tersebut sudah tersedia. Pilih dari daftar kategori.", 409);
    }
    return apiError("Kategori belum dapat disimpan. Silakan coba lagi.", 500);
  }
}
