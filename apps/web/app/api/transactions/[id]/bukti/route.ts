import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { z } from "zod";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:transactions:id:bukti");

const updateBuktiSchema = z.object({
  buktiTransaksiUrls: z.array(z.string().url("Harus berupa URL yang valid")).default([]),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let id = "";
  try {
    const user = await requirePermission("transaction", "update");
    const storeId = user.storeId || "store-main";
    ({ id } = await params);

    const body = await request.json();
    const parsed = updateBuktiSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const { buktiTransaksiUrls } = parsed.data;

    const existingTransaction = await db.transaction.findFirst({
      where: { id, storeId },
      select: { id: true },
    });

    if (!existingTransaction) {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }

    const updated = await db.transaction.update({
      where: { id },
      data: {
        buktiTransaksiUrls,
      },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to update transaction bukti:", error);
    if (error?.code === "P2025") {
      return NextResponse.json(
        { message: "Transaksi tidak ditemukan" },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { message: "Failed to update transaction bukti" },
      { status: 500 }
    );
  }
}
