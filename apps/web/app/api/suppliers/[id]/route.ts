import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiError, apiValidationError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import {
  getSupplierOrThrow,
  SupplierNotFoundError,
  updateSupplierWithWarnings,
} from "@/features/suppliers/services/suppliers-service";
import {
  isSupplierCodeUniqueError,
  normalizeSupplierCode,
} from "@/features/suppliers/helpers/supplier-code";
import { SUPPLIER_TYPES } from "@/features/suppliers/types/supplier";

const log = getLogger("api:suppliers:id");

const supplierInputSchema = z.object({
  code: z.string().trim().max(50).optional().or(z.literal("")),
  name: z.string().trim().min(1, "Name is required").max(120),
  type: z.enum(SUPPLIER_TYPES),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  contactPerson: z.string().trim().max(120).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requirePermission("supplier", "read");
    const { id } = await context.params;
    const supplier = await getSupplierOrThrow(id);
    return NextResponse.json({ data: supplier });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof SupplierNotFoundError) {
      return apiError("Supplier not found", 404, { code: "NotFound" });
    }

    log.error("suppliers.get.failed", { error });
    return apiError("Failed to fetch supplier", 500, { code: "InternalError" });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requirePermission("supplier", "update");
    const { id } = await context.params;
    const parsed = supplierInputSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await updateSupplierWithWarnings(id, {
      code: normalizeSupplierCode(parsed.data.code),
      name: parsed.data.name,
      type: parsed.data.type,
      phone: parsed.data.phone || null,
      contactPerson: parsed.data.contactPerson || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    });

    return NextResponse.json({
      data: result.supplier,
      warnings: result.warnings,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (isSupplierCodeUniqueError(error)) {
      return apiError("Kode supplier sudah dipakai supplier lain.", 409, {
        code: "Conflict",
      });
    }

    log.error("suppliers.update.failed", { error });
    return apiError("Failed to update supplier", 500, { code: "InternalError" });
  }
}
