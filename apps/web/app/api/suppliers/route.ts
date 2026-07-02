import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import {
  apiError,
  apiList,
  apiValidationError,
  buildPaginationMeta,
  parsePagination,
} from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import {
  createSupplierWithWarnings,
  listSuppliersPage,
} from "@/features/suppliers/services/suppliers-service";
import {
  isSupplierCodeUniqueError,
  normalizeSupplierCode,
} from "@/features/suppliers/helpers/supplier-code";
import { SUPPLIER_TYPES } from "@/features/suppliers/types/supplier";

const log = getLogger("api:suppliers");

const supplierInputSchema = z.object({
  code: z.string().trim().max(50).optional().or(z.literal("")),
  name: z.string().trim().min(1, "Name is required").max(120),
  type: z.enum(SUPPLIER_TYPES),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  contactPerson: z.string().trim().max(120).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function GET(request: Request) {
  try {
    await requirePermission("supplier", "read");
    const { searchParams } = new URL(request.url);
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    });
    const q = searchParams.get("q")?.trim() || undefined;
    const requestedType = searchParams.get("type");
    const type = SUPPLIER_TYPES.includes(
      requestedType as (typeof SUPPLIER_TYPES)[number],
    )
      ? (requestedType as (typeof SUPPLIER_TYPES)[number])
      : undefined;
    const activeParam = searchParams.get("isActive");
    const isActive =
      activeParam === "true" ? true : activeParam === "false" ? false : undefined;

    const result = await listSuppliersPage({ q, type, isActive, skip, take: limit });

    return apiList(
      result.suppliers,
      buildPaginationMeta(result.total, page, limit),
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("suppliers.list.failed", { error });
    return apiError("Failed to fetch suppliers", 500, { code: "InternalError" });
  }
}

export async function POST(request: Request) {
  try {
    await requirePermission("supplier", "create");
    const parsed = supplierInputSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await createSupplierWithWarnings({
      code: normalizeSupplierCode(parsed.data.code),
      name: parsed.data.name,
      type: parsed.data.type,
      phone: parsed.data.phone || null,
      contactPerson: parsed.data.contactPerson || null,
      address: parsed.data.address || null,
      notes: parsed.data.notes || null,
    });

    return NextResponse.json(
      { data: result.supplier, warnings: result.warnings },
      { status: 201 },
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (isSupplierCodeUniqueError(error)) {
      return apiError("Kode supplier sudah dipakai supplier lain.", 409, {
        code: "Conflict",
      });
    }

    log.error("suppliers.create.failed", { error });
    return apiError("Failed to create supplier", 500, { code: "InternalError" });
  }
}
