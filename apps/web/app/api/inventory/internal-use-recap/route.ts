import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@pos/db";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { buildInternalUseRecap } from "@/features/internal-use-recap/helpers/internal-use-recap";
import { resolveInternalUsePeriodRange, todayJakartaIsoDate } from "@/features/internal-use-recap/helpers/period";

const log = getLogger("api:inventory:internal-use-recap");

const querySchema = z.object({
  period: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default(() => todayJakartaIsoDate()),
});

export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("product", "read");
    const storeId = user.storeId || "store-main";
    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      period: searchParams.get("period") ?? undefined,
      date: searchParams.get("date") ?? undefined,
    });

    if (!parsed.success) return apiValidationError(parsed.error);

    const range = resolveInternalUsePeriodRange(parsed.data.period, parsed.data.date);
    if (!range) {
      return apiError("Invalid recap date", 422, {
        code: "ValidationError",
        errors: { date: ["Invalid calendar date"] },
      });
    }

    const rows = await db.inventoryLog.findMany({
      where: {
        product: { storeId },
        type: "OUT",
        reason: "USAGE",
        status: "APPROVED",
        createdAt: {
          gte: range.startDate,
          lt: range.endDate,
        },
      },
      select: {
        id: true,
        productId: true,
        quantity: true,
        unitCost: true,
        note: true,
        person: true,
        createdAt: true,
        product: {
          select: {
            id: true,
            name: true,
            sku: true,
            unit: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    });

    const recap = buildInternalUseRecap({
      rows,
      period: parsed.data.period,
      anchorDate: parsed.data.date,
    });

    return NextResponse.json({ data: recap });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to build internal use recap:", error);
    return apiError("Failed to build internal use recap", 500, {
      code: "InternalError",
    });
  }
}
