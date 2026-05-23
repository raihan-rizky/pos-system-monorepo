import { apiError, apiNoContent, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { db } from "@pos/db";
import { NextResponse } from "next/server";
import { z } from "zod";

const updatePrintingServiceSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").optional(),
    basePrice: z.coerce.number().min(0, "Base price must be >= 0").optional(),
    unit: z.string().trim().min(1, "Unit is required").optional(),
    description: z.string().trim().optional().nullable(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("product", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    const existing = await db.printingService.findFirst({
      where: { id, storeId },
      select: { id: true },
    });

    if (!existing) {
      return apiError("Printing service not found", 404, { code: "NotFound" });
    }

    const body = await request.json();
    const data = updatePrintingServiceSchema.parse(body);
    const service = await db.printingService.update({
      where: { id: existing.id },
      data,
    });

    return NextResponse.json(service);
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    if (error instanceof z.ZodError) {
      return apiValidationError(error);
    }

    return apiError("Failed to update printing service", 500, {
      code: "InternalError",
    });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("product", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    const existing = await db.printingService.findFirst({
      where: { id, storeId },
      select: { id: true },
    });

    if (!existing) {
      return apiError("Printing service not found", 404, { code: "NotFound" });
    }

    await db.printingService.update({
      where: { id: existing.id },
      data: { isActive: false },
    });

    return apiNoContent();
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    return apiError("Failed to delete printing service", 500, {
      code: "InternalError",
    });
  }
}
