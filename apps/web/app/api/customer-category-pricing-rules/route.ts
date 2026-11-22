import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { apiCollection, apiError, apiValidationError } from "@/lib/api/responses";
import {
  handleAuthError,
  requirePermission,
  requireRole,
} from "@/lib/rbac/guard";
import {
  isPricingCustomerType,
  type CategoryCustomerPricingMode,
  type CustomerType,
  normalizePricingUnits,
} from "@/features/customer-category-pricing/helpers/pricing-rules";
import { getLogger } from "@/lib/logger";
import { pricingRuleSchema, storedCustomerTargets, serializePricingRule, pricingRuleInclude, lockPricingRules, hasOverlappingPricingRule, overlapMessage } from "@/features/customer-category-pricing/helpers/rule-persistence";
import { pricingRuleTransactionOptions } from "@/features/customer-category-pricing/helpers/rule-persistence";
import { hasOverlappingSubcategoryPricingRule, serializeSubcategoryPricingRule, subcategoryPricingRuleInclude } from "@/features/customer-category-pricing/helpers/rule-persistence";

const log = getLogger("api:customer-category-pricing-rules");

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

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requirePermission("product", "read");
    const storeId = user.storeId || "store-main";
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";
    const customerType = searchParams.get("customerType");
    const categoryId = searchParams.get("categoryId");
    const brandId = searchParams.get("brandId");

    if (customerType && !isPricingCustomerType(customerType)) {
      return apiError("Tipe pelanggan tidak valid", 422, {
        code: "ValidationError",
        errors: { customerType: ["Tipe pelanggan tidak valid"] },
      });
    }

    const rules = await db.categoryCustomerPricingRule.findMany({
      where: {
        storeId,
        ...(activeOnly ? { isActive: true } : {}),
        ...(customerType ? { customerTypes: customerType === "ALL" ? { isEmpty: true } : { has: customerType as CustomerType } } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(brandId ? { brandId } : {}),
      },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        brand: { select: { id: true, name: true, normalizedName: true } },
      },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });
    const scopedRules = await db.subcategoryCustomerPricingRule.findMany({
      where: {
        storeId,
        ...(activeOnly ? { isActive: true } : {}),
        ...(customerType ? { customerTypes: customerType === "ALL" ? { isEmpty: true } : { has: customerType as CustomerType } } : {}),
        ...(categoryId ? { subcategoryId: categoryId } : {}),
        ...(brandId ? { brandId } : {}),
      },
      include: subcategoryPricingRuleInclude,
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });
    return apiCollection([...rules.map(serializePricingRule), ...scopedRules.map(serializeSubcategoryPricingRule)]);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch pricing rules:", error);
    return apiError("Aturan harga belum berhasil dimuat", 500, {
      code: "InternalError",
    });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("OWNER");
    const storeId = user.storeId || "store-main";
    const body = await request.json();
    if (body.scope !== undefined && body.scope !== "CATEGORY" && body.scope !== "SUBCATEGORY") return apiError("Cakupan aturan tidak valid", 422, { code: "ValidationError" });
    const parsed = pricingRuleSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const data = parsed.data as z.infer<typeof pricingRuleSchema> & {
      mode: CategoryCustomerPricingMode;
    };
    const units = normalizePricingUnits(data.units, data.unit);
    const normalizedUnit = units.length === 1 ? units[0] : null;
    const brandId = data.brandId || null;

    const isSubcategory = body.scope === "SUBCATEGORY";
    const categoryExists = isSubcategory
      ? Boolean(await db.productSubcategory.findUnique({ where: { id: data.categoryId }, select: { id: true } }))
      : await assertCategoryExists(data.categoryId);
    if (!categoryExists) {
      return apiError("Kategori tidak ditemukan", 404, { code: "NotFound" });
    }
    if (!(await assertBrandExists(storeId, brandId))) {
      return apiError("Merek tidak ditemukan", 404, { code: "NotFound" });
    }

    return await db.$transaction(async (tx) => {
      await lockPricingRules(tx, storeId);
      const targets = storedCustomerTargets(data);
      const isActive = data.isActive ?? true;
      const scope = { storeId, categoryId: data.categoryId, ...targets, unit: normalizedUnit, units, brandId };
      if (isActive && await (isSubcategory ? hasOverlappingSubcategoryPricingRule(tx, scope) : hasOverlappingPricingRule(tx, scope))) {
        return apiError(overlapMessage, 409, { code: "Conflict" });
      }
      if (isSubcategory) {
        const created = await tx.subcategoryCustomerPricingRule.create({
          data: { storeId, subcategoryId: data.categoryId, ...targets, unit: normalizedUnit, units, brandId, mode: data.mode, value: data.value, discountPercent: data.mode === "UNIT_COST_PLUS_PERCENT_DISCOUNT" ? data.discountPercent : 0, isActive, createdBy: user.id, updatedBy: user.id },
          include: subcategoryPricingRuleInclude,
        });
        return NextResponse.json(serializeSubcategoryPricingRule(created), { status: 201 });
      }
      const created = await tx.categoryCustomerPricingRule.create({
        data: { storeId, categoryId: data.categoryId, ...targets, unit: normalizedUnit, units, brandId, mode: data.mode, value: data.value, discountPercent: data.mode === "UNIT_COST_PLUS_PERCENT_DISCOUNT" ? data.discountPercent : 0, isActive, createdBy: user.id, updatedBy: user.id },
        include: pricingRuleInclude,
      });
      return NextResponse.json(serializePricingRule(created), { status: 201 });
    }, pricingRuleTransactionOptions);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to create pricing rule:", error);
    return apiError("Aturan harga belum berhasil disimpan", 500, {
      code: "InternalError",
    });
  }
}
