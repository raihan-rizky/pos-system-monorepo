import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { apiError, apiList, apiValidationError, buildPaginationMeta, parsePagination } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const printingServiceSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  basePrice: z.coerce.number().min(0, "Base price must be >= 0"),
  unit: z.string().trim().min(1, "Unit is required").default("pcs"),
  description: z.string().trim().optional().nullable(),
  isActive: z.boolean().default(true),
});

export async function GET(request: Request) {
  try {
    const user = await requirePermission("product", "read");
    const storeId = user.storeId || "store-main";
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    });
    const search = searchParams.get("search")?.trim() || "";
    const includeInactive = searchParams.get("includeInactive") === "true";

    const where: Prisma.PrintingServiceWhereInput = {
      storeId,
      ...(includeInactive ? {} : { isActive: true }),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [services, total] = await Promise.all([
      db.printingService.findMany({
        where,
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      db.printingService.count({ where }),
    ]);

    return apiList(services, buildPaginationMeta(total, page, limit));
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    return apiError("Failed to fetch printing services", 500, {
      code: "InternalError",
    });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("product", "update");
    const storeId = user.storeId || "store-main";
    const body = await request.json();
    const data = printingServiceSchema.parse(body);

    const duplicate = await db.printingService.findFirst({
      where: {
        storeId,
        name: data.name,
        isActive: true,
      },
      select: { id: true },
    });

    if (duplicate) {
      return apiError("Printing service name already exists", 409, {
        code: "Conflict",
      });
    }

    const service = await db.printingService.create({
      data: {
        storeId,
        name: data.name,
        basePrice: data.basePrice,
        unit: data.unit,
        description: data.description ?? null,
        isActive: data.isActive,
      },
    });

    return NextResponse.json(service, { status: 201 });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    if (error instanceof z.ZodError) {
      return apiValidationError(error);
    }

    return apiError("Failed to create printing service", 500, {
      code: "InternalError",
    });
  }
}
