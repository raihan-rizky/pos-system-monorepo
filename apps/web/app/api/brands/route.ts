import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { apiCollection, apiError, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:brands");

const brandSchema = z.object({
  name: z.string().trim().min(1, "Nama merek wajib diisi"),
});

function cleanBrandName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeBrandName(value: string) {
  return cleanBrandName(value).toLowerCase();
}

function serializeBrand(brand: {
  id: string;
  storeId: string;
  name: string;
  normalizedName: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...brand,
    createdAt: brand.createdAt.toISOString(),
    updatedAt: brand.updatedAt.toISOString(),
  };
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requirePermission("product", "read");
    const storeId = user.storeId || "store-main";

    const brands = await db.brand.findMany({
      where: { storeId },
      orderBy: { name: "asc" },
    });

    return apiCollection(brands.map(serializeBrand));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch brands:", error);
    return apiError("Failed to fetch brands", 500, { code: "InternalError" });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("product", "update");
    const storeId = user.storeId || "store-main";
    const body = await request.json();
    const parsed = brandSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const name = cleanBrandName(parsed.data.name);
    const normalizedName = normalizeBrandName(name);

    const duplicate = await db.brand.findFirst({
      where: { storeId, normalizedName },
      select: { id: true },
    });
    if (duplicate) {
      return apiError("Merek dengan nama ini sudah ada", 409, {
        code: "Conflict",
      });
    }

    const created = await db.brand.create({
      data: {
        storeId,
        name,
        normalizedName,
      },
    });

    return NextResponse.json(serializeBrand(created), { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to create brand:", error);
    return apiError("Failed to create brand", 500, { code: "InternalError" });
  }
}
