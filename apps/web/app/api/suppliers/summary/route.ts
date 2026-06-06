import { NextResponse } from "next/server";

import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { getSupplierSummary } from "@/features/suppliers/services/suppliers-service";

const log = getLogger("api:suppliers:summary");

export async function GET(request: Request) {
  try {
    await requirePermission("supplier", "read");
    const { searchParams } = new URL(request.url);
    const summary = await getSupplierSummary({
      from: parseDate(searchParams.get("from")),
      to: parseDate(searchParams.get("to")),
      supplierId: searchParams.get("supplierId") || undefined,
    });

    return NextResponse.json(summary);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("suppliers.summary.failed", { error });
    return apiError("Failed to fetch supplier summary", 500, {
      code: "InternalError",
    });
  }
}

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
