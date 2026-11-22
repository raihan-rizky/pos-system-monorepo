import { NextResponse } from "next/server";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { ClassificationCatalogError, manageClassificationSubcategory } from "@/features/product-classification/server/classification-catalog";

export const dynamic = "force-dynamic";
const log = getLogger("api:product-classification:manage");

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ message: "Format data belum benar. Silakan coba lagi." }, 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !("action" in raw) ||
    (raw.action !== "create" && raw.action !== "update" && raw.action !== "delete")) {
    return json({ message: "Pilih tindakan subkategori yang tersedia." }, 422);
  }
  try {
    await requirePermission("product", raw.action);
    return json(await manageClassificationSubcategory(raw));
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) {
      authError.headers.set("Cache-Control", "no-store");
      return authError;
    }
    if (error instanceof ClassificationCatalogError) return json({ message: error.message }, error.status);
    if (error && typeof error === "object" && "code" in error && ["P2002", "P2003", "P2034"].includes(String(error.code))) {
      return json({ message: "Subkategori masih digunakan atau telah berubah. Muat ulang dan coba lagi." }, 409);
    }
    log.error("Gagal mengelola subkategori produk.");
    return json({ message: "Subkategori belum berhasil disimpan. Silakan coba lagi." }, 500);
  }
}
