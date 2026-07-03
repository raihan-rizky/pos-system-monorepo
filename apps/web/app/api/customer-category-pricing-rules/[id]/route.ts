import { apiError, apiNoContent, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission, requireRole } from "@/lib/rbac/guard";
import {
  isPricingCustomerType,
  isPricingMode,
  type CategoryCustomerPricingMode,
  type CustomerType,
  type PricingCustomerType,
  normalizePricingUnit,
} from "@/features/customer-category-pricing/helpers/pricing-rules";
import { getLogger } from "@/lib/logger";
import { db } from "@pos/db";
import { z } from "zod";

const log = getLogger("api:customer-category-pricing-rules:id");

const patchRuleSchema = z
  .object({
    categoryId: z.string().min(1, "Kategori wajib dipilih").optional(),
    customerType: z.string().refine(isPricingCustomerType, "Tipe pelanggan tidak valid").optional(),
    unit: z.string().optional().nullable(),
    brandId: z.string().optional().nullable(),
    mode: z.string().refine(isPricingMode, "Mode harga tidak valid").optional(),
    value: z.coerce.number().optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((input, ctx) => {
    if (Object.keys(input).length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["_form"],
        message: "Tidak ada field yang diubah",
      });
      return;
    }
    if (input.mode === "FLAT_DISCOUNT" && input.value !== undefined && input.value <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Diskon tetap harus lebih dari 0",
      });
    }
    if (
      input.mode === "PERCENT_DISCOUNT" &&
      input.value !== undefined &&
      (input.value <= 0 || input.value > 100)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Diskon harus lebih dari 0 dan maksimal 100%",
      });
    }
  });

type RuleWithCategory = {
  id: string;
  storeId: string;
  categoryId: string;
  customerType: CustomerType | null;
  unit: string | null;
  brandId: string | null;
  mode: CategoryCustomerPricingMode;
  value: unknown;
  isActive: boolean;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string; icon: string | null; color: string | null };
  brand?: { id: string; name: string; normalizedName: string } | null;
};

function serializeRule(rule: RuleWithCategory) {
  return {
    ...rule,
    customerType: rule.customerType ?? "ALL",
    value: Number(rule.value),
  };
}

function toStoredCustomerType(customerType: PricingCustomerType) {
  return customerType === "ALL" ? null : customerType;
}

async function findRule(id: string, storeId: string) {
  return db.categoryCustomerPricingRule.findFirst({
    where: { id, storeId },
    include: {
      category: { select: { id: true, name: true, icon: true, color: true } },
      brand: { select: { id: true, name: true, normalizedName: true } },
    },
  });
}

async function assertCategoryExists(categoryId: string) {
  const category = await db.category.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  return Boolean(category);
}

async function assertBrandExists(storeId: string, brandId: string | null | undefined) {
  if (!brandId) return true;
  const brand = await db.brand.findUnique({
    where: { id: brandId },
    select: { id: true, storeId: true },
  });
  return Boolean(brand && brand.storeId === storeId);
}

async function hasDuplicateActiveRule(input: {
  storeId: string;
  categoryId: string;
  customerType: PricingCustomerType;
  unit?: string | null;
  brandId?: string | null;
  excludeId: string;
}) {
  const duplicate = await db.categoryCustomerPricingRule.findFirst({
    where: {
      storeId: input.storeId,
      categoryId: input.categoryId,
      customerType: toStoredCustomerType(input.customerType),
      unit: normalizePricingUnit(input.unit),
      brandId: input.brandId ?? null,
      isActive: true,
      id: { not: input.excludeId },
    },
    select: { id: true },
  });
  return Boolean(duplicate);
}

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("product", "read");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    const rule = await findRule(id, storeId);
    if (!rule) return apiError("Aturan harga tidak ditemukan", 404, { code: "NotFound" });

    return Response.json(serializeRule(rule as RuleWithCategory));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch pricing rule:", error);
    return apiError("Failed to fetch pricing rule", 500, {
      code: "InternalError",
    });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole("OWNER");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const body = await request.json();
    const parsed = patchRuleSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const existing = await findRule(id, storeId);
    if (!existing) return apiError("Aturan harga tidak ditemukan", 404, { code: "NotFound" });

    const data = parsed.data as z.infer<typeof patchRuleSchema> & {
      customerType?: PricingCustomerType;
      mode?: CategoryCustomerPricingMode;
    };
    const nextCategoryId = data.categoryId ?? existing.categoryId;
    const nextCustomerType = data.customerType ?? ((existing.customerType ?? "ALL") as PricingCustomerType);
    const nextUnit = data.unit !== undefined ? normalizePricingUnit(data.unit) : existing.unit;
    const nextBrandId = data.brandId !== undefined ? data.brandId || null : existing.brandId;
    const nextMode = data.mode ?? (existing.mode as CategoryCustomerPricingMode);
    const nextValue = data.value ?? Number(existing.value);
    const nextIsActive = data.isActive ?? existing.isActive;

    if (data.categoryId && !(await assertCategoryExists(data.categoryId))) {
      return apiError("Kategori tidak ditemukan", 404, { code: "NotFound" });
    }
    if (data.brandId !== undefined && !(await assertBrandExists(storeId, nextBrandId))) {
      return apiError("Merek tidak ditemukan", 404, { code: "NotFound" });
    }

    const valueValidation = patchRuleSchema.safeParse({
      categoryId: nextCategoryId,
      customerType: nextCustomerType,
      mode: nextMode,
      value: nextValue,
      isActive: nextIsActive,
    });
    if (!valueValidation.success) return apiValidationError(valueValidation.error);

    if (
      nextIsActive &&
      (await hasDuplicateActiveRule({
        storeId,
        categoryId: nextCategoryId,
        customerType: nextCustomerType,
        unit: nextUnit,
        brandId: nextBrandId,
        excludeId: id,
      }))
    ) {
      return apiError(
        "Aturan aktif untuk tipe pelanggan dan kategori ini sudah ada",
        409,
        { code: "Conflict" },
      );
    }

    const updated = await db.categoryCustomerPricingRule.update({
      where: { id: existing.id },
      data: {
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
        ...(data.customerType !== undefined ? { customerType: toStoredCustomerType(data.customerType) } : {}),
        ...(data.unit !== undefined ? { unit: normalizePricingUnit(data.unit) } : {}),
        ...(data.brandId !== undefined ? { brandId: data.brandId || null } : {}),
        ...(data.mode !== undefined ? { mode: data.mode } : {}),
        ...(data.value !== undefined ? { value: data.value } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        updatedBy: user.id,
      },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        brand: { select: { id: true, name: true, normalizedName: true } },
      },
    });

    return Response.json(serializeRule(updated as RuleWithCategory));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to update pricing rule:", error);
    return apiError("Failed to update pricing rule", 500, {
      code: "InternalError",
    });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireRole("OWNER");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const existing = await findRule(id, storeId);
    if (!existing) return apiError("Aturan harga tidak ditemukan", 404, { code: "NotFound" });

    await db.categoryCustomerPricingRule.update({
      where: { id: existing.id },
      data: { isActive: false, updatedBy: user.id },
    });

    return apiNoContent();
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to delete pricing rule:", error);
    return apiError("Failed to delete pricing rule", 500, {
      code: "InternalError",
    });
  }
}
