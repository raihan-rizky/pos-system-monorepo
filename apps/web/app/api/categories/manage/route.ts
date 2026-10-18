import { NextResponse } from "next/server";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { CategoryManagementError, executeCategoryAction } from "@/features/product-categories/server/category-management";

export const dynamic = "force-dynamic";
const log = getLogger("api:categories:manage");

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ message: "Format JSON tidak valid. Periksa data lalu coba lagi.", code: "ValidationError" }, 400);
  }

  const action = raw && typeof raw === "object" && "action" in raw ? raw.action : null;
  try {
    let actor;
    switch (action) {
      case "create":
        actor = await requirePermission("product", "create");
        break;
      case "update":
      case "preview-move":
      case "move":
        actor = await requirePermission("product", "update");
        break;
      case "preview-delete":
      case "delete":
        actor = await requirePermission("product", "delete");
        await requirePermission("product", "update");
        break;
      default:
        return json({ message: "Aksi kategori tidak dikenal. Muat ulang halaman lalu coba lagi.", code: "ValidationError" }, 422);
    }

    const result = await executeCategoryAction(raw, { id: actor.id, role: actor.role, storeId: actor.storeId });
    return json(result, action === "create" ? 201 : 200);
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) {
      return json({
        message: authError.status === 401 ? "Sesi Anda berakhir. Silakan masuk kembali." : "Anda belum memiliki izin untuk tindakan kategori ini.",
        code: authError.status === 401 ? "Unauthorized" : "Forbidden",
      }, authError.status);
    }
    if (error instanceof CategoryManagementError) {
      return json({ message: error.message, ...(error.errors ? { errors: error.errors } : {}) }, error.status);
    }

    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (code === "P2034") {
      return json({ message: "Data kategori berubah saat diproses. Muat ulang dan tinjau kembali sebelum mencoba lagi.", code: "Conflict" }, 409);
    }
    if (code === "P2002") {
      return json({ message: "Nama kategori sudah digunakan. Periksa nama kategori lalu coba lagi.", code: "Conflict" }, 409);
    }
    if (code === "P2003") {
      return json({ message: "Data terkait kategori berubah. Muat ulang dan pilih kembali kategori tujuan.", code: "Conflict" }, 409);
    }

    log.error("Gagal memproses pengelolaan kategori.");
    return json({ message: "Kategori belum berhasil diproses. Silakan coba lagi.", code: "InternalError" }, 500);
  }
}
