import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:transactions:cancel-draft");

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("transaction.draft", "delete");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    const result = await db.transaction.updateMany({
      where: { id, storeId, status: "DRAFT" },
      data: { status: "VOIDED" },
    });

    if (result.count !== 1) {
      return NextResponse.json(
        { message: "Hanya draft yang bisa dibatalkan" },
        { status: 409 },
      );
    }

    return NextResponse.json({ id, status: "VOIDED" }, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to cancel draft:", error);
    return NextResponse.json(
      { message: "Failed to cancel draft" },
      { status: 500 },
    );
  }
}
