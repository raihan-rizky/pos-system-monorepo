import { NextResponse } from "next/server";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { applyClassificationMove, ClassificationMoveError, previewClassificationMove } from "@/features/product-classification/server/classification-move";

export const dynamic = "force-dynamic";
const log = getLogger("api:product-classification:move");

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
    (raw.action !== "preview" && raw.action !== "apply")) {
    return json({ message: "Pilih tindakan pemindahan yang tersedia." }, 422);
  }

  try {
    const actor = await requirePermission("product", "update");
    const { action, ...input } = raw as { action: "preview" | "apply"; productIds: string[]; subcategoryId: string; token: string };
    return json(action === "preview"
      ? await previewClassificationMove(actor, input)
      : await applyClassificationMove(actor, input));
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) {
      authError.headers.set("Cache-Control", "no-store");
      return authError;
    }
    if (error instanceof ClassificationMoveError) return json({ message: error.message }, error.status);
    if (error && typeof error === "object" && "code" in error && (error.code === "P2034" || error.code === "P2003")) {
      return json({ message: "Data produk berubah. Tinjau kembali sebelum memindahkan satuan." }, 409);
    }
    log.error("Gagal memindahkan klasifikasi produk.");
    return json({ message: "Satuan belum berhasil dipindahkan. Silakan coba lagi." }, 500);
  }
}
