import { NextResponse } from "next/server";
import { handleAuthError, requireRole } from "@/lib/rbac/guard";

export async function POST(
  _request: Request,
  _context: { params: Promise<{ id: string }> },
) {
  try {
    // Receipt-wide revision was replaced by decisions per item. Older clients
    // get a clear response without authorizing an unknown permission resource.
    await requireRole("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");
    return NextResponse.json({
      message: "Alur revisi ini sudah tidak digunakan. Buka Penerimaan Barang dan gunakan persetujuan per item.",
    }, { status: 410 });
  } catch (error) {
    return handleAuthError(error) ?? NextResponse.json({ message: "Sesi belum dapat diperiksa. Silakan coba lagi." }, { status: 503 });
  }
}
