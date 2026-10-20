import { NextResponse } from "next/server";
import { AuthError, handleAuthError, requireRole } from "@/lib/rbac/guard";
import { canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import type { Role } from "@/lib/rbac/permissions";
import { PrintingReceiptValidationError } from "../domain";
import { PrintingReceiptStorageError } from "./receipt-store";

export async function requirePrintingReceiptWritePermission(action: "create" | "update" | "delete" = "create") {
  const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES");
  const permissions = await getGlobalRolePermissions();
  const resource = user.role === "SALES" && action !== "delete" ? "transaction.request" : "transaction";
  if (!canRolePerformAction(user.role as Role, resource, action, permissions)) {
    throw new AuthError(403, action === "delete"
      ? "Anda belum memiliki izin untuk menghapus nota percetakan."
      : "Anda belum memiliki izin untuk menyimpan nota percetakan.");
  }
  return user;
}

export async function readPrintingReceiptJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (text.length > 250_000) throw new PrintingReceiptValidationError("Isi nota terlalu besar. Kurangi jumlah atau panjang isian.");
  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new PrintingReceiptValidationError("Data nota belum valid. Muat ulang halaman lalu coba kembali."); }
}

export function parsePrintingReceiptRevision(input: unknown): number {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 1 || input >= 2_147_483_647) {
    throw new PrintingReceiptValidationError("Revisi nota tidak valid. Muat ulang nota sebelum melanjutkan.");
  }
  return input;
}

export function printingReceiptErrorResponse(error: unknown): Response {
  const auth = handleAuthError(error);
  if (auth) return auth;
  if (error instanceof PrintingReceiptValidationError) return NextResponse.json({ message: error.message }, { status: 422 });
  if (error instanceof PrintingReceiptStorageError) return NextResponse.json({ message: error.message }, { status: error.status });
  console.error("Gagal menyimpan atau membaca nota percetakan", error);
  return NextResponse.json({ message: "Nota belum dapat diproses. Silakan coba kembali." }, { status: 500 });
}
