import { apiError, apiNoContent, apiValidationError } from "@/lib/api/responses";
import { handleAuthError, requirePermission, requireRole } from "@/lib/rbac/guard";
import {
  type CategoryCustomerPricingMode,
  normalizePricingUnits,
} from "@/features/customer-category-pricing/helpers/pricing-rules";
import { getLogger } from "@/lib/logger";
import { db, type Prisma } from "@pos/db";
import { pricingRuleSchema, pricingRulePatchSchema, readCustomerTargets, storedCustomerTargets, serializePricingRule, pricingRuleInclude, lockPricingRules, hasOverlappingPricingRule, overlapMessage } from "@/features/customer-category-pricing/helpers/rule-persistence";
import { pricingRuleTransactionOptions } from "@/features/customer-category-pricing/helpers/rule-persistence";
import { hasOverlappingSubcategoryPricingRule, serializeSubcategoryPricingRule, subcategoryPricingRuleInclude } from "@/features/customer-category-pricing/helpers/rule-persistence";

const log = getLogger("api:customer-category-pricing-rules:id");

async function findRule(id: string, storeId: string, client: Pick<Prisma.TransactionClient, "categoryCustomerPricingRule"> = db) {
  return client.categoryCustomerPricingRule.findFirst({
    where: { id, storeId },
    include: {
      category: { select: { id: true, name: true, icon: true, color: true } },
      brand: { select: { id: true, name: true, normalizedName: true } },
    },
  });
}

async function findSubcategoryRule(id: string, storeId: string, client: Pick<Prisma.TransactionClient, "subcategoryCustomerPricingRule"> = db) {
  return client.subcategoryCustomerPricingRule.findFirst({ where: { id, storeId }, include: subcategoryPricingRuleInclude });
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
    if (!rule) {
      const scoped = await findSubcategoryRule(id, storeId);
      return scoped ? Response.json(serializeSubcategoryPricingRule(scoped)) : apiError("Aturan harga tidak ditemukan", 404, { code: "NotFound" });
    }

    return Response.json(serializePricingRule(rule));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch pricing rule:", error);
    return apiError("Aturan harga belum berhasil dimuat", 500, {
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
    const parsed = pricingRulePatchSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);
    return await db.$transaction(async (tx) => {
      await lockPricingRules(tx, storeId);
      const existing = await findRule(id, storeId, tx);
      const data = parsed.data;
      if (!existing) {
        const scoped = await findSubcategoryRule(id, storeId, tx);
        if (!scoped) return apiError("Aturan harga tidak ditemukan", 404, { code: "NotFound" });
        const targets = data.customerTypes !== undefined || data.customerType !== undefined
          ? storedCustomerTargets(data) : storedCustomerTargets({ customerTypes: readCustomerTargets(scoped) });
        const units = data.units !== undefined || data.unit !== undefined ? normalizePricingUnits(data.units, data.unit) : normalizePricingUnits(scoped.units, scoped.unit);
        const next = {
          categoryId: data.categoryId ?? scoped.subcategoryId, ...targets,
          unit: units.length === 1 ? units[0] : null, units,
          brandId: data.brandId !== undefined ? data.brandId || null : scoped.brandId,
          mode: data.mode ?? scoped.mode, value: data.value ?? Number(scoped.value),
          discountPercent: (data.mode ?? scoped.mode) === "UNIT_COST_PLUS_PERCENT_DISCOUNT"
            ? data.discountPercent ?? (scoped.mode === "UNIT_COST_PLUS_PERCENT_DISCOUNT" ? Number(scoped.discountPercent) : undefined) : 0,
          isActive: data.isActive ?? scoped.isActive,
        };
        const validation = pricingRuleSchema.safeParse({ ...next, customerType: undefined, customerTypes: next.customerTypes.length ? next.customerTypes : ["ALL"] });
        if (!validation.success) return apiValidationError(validation.error);
        if (data.categoryId && !(await tx.productSubcategory.findUnique({ where: { id: next.categoryId }, select: { id: true } }))) return apiError("Subkategori tidak ditemukan", 404, { code: "NotFound" });
        if (data.brandId !== undefined && !(await assertBrandExists(storeId, next.brandId))) return apiError("Merek tidak ditemukan", 404, { code: "NotFound" });
        if (next.isActive && await hasOverlappingSubcategoryPricingRule(tx, { storeId, ...next, excludeId: id })) return apiError(overlapMessage, 409, { code: "Conflict" });
        const { categoryId, ...values } = next;
        const updated = await tx.subcategoryCustomerPricingRule.update({ where: { id }, data: { ...values, subcategoryId: categoryId, mode: next.mode as CategoryCustomerPricingMode, updatedBy: user.id }, include: subcategoryPricingRuleInclude });
        return Response.json(serializeSubcategoryPricingRule(updated));
      }
      const targets = data.customerTypes !== undefined || data.customerType !== undefined
        ? storedCustomerTargets(data) : storedCustomerTargets({ customerTypes: readCustomerTargets(existing) });
      const units = data.units !== undefined || data.unit !== undefined
        ? normalizePricingUnits(data.units, data.unit)
        : normalizePricingUnits(existing.units, existing.unit);
      const next = {
        categoryId: data.categoryId ?? existing.categoryId,
        ...targets,
        unit: units.length === 1 ? units[0] : null,
        units,
        brandId: data.brandId !== undefined ? data.brandId || null : existing.brandId,
        mode: data.mode ?? existing.mode,
        value: data.value ?? Number(existing.value),
        discountPercent: (data.mode ?? existing.mode) === "UNIT_COST_PLUS_PERCENT_DISCOUNT"
          ? data.discountPercent ?? (existing.mode === "UNIT_COST_PLUS_PERCENT_DISCOUNT" ? Number(existing.discountPercent) : undefined)
          : 0,
        isActive: data.isActive ?? existing.isActive,
      };
      const validation = pricingRuleSchema.safeParse({ ...next, customerType: undefined, customerTypes: next.customerTypes.length ? next.customerTypes : ["ALL"] });
      if (!validation.success) return apiValidationError(validation.error);
      if (data.categoryId && !(await assertCategoryExists(next.categoryId))) return apiError("Kategori tidak ditemukan", 404, { code: "NotFound" });
      if (data.brandId !== undefined && !(await assertBrandExists(storeId, next.brandId))) return apiError("Merek tidak ditemukan", 404, { code: "NotFound" });
      if (next.isActive && await hasOverlappingPricingRule(tx, { storeId, ...next, excludeId: id })) return apiError(overlapMessage, 409, { code: "Conflict" });
      const updated = await tx.categoryCustomerPricingRule.update({
        where: { id: existing.id }, data: { ...next, mode: next.mode as CategoryCustomerPricingMode, updatedBy: user.id }, include: pricingRuleInclude,
      });
      return Response.json(serializePricingRule(updated));
    }, pricingRuleTransactionOptions);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to update pricing rule:", error);
    return apiError("Aturan harga belum berhasil disimpan", 500, {
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
    return await db.$transaction(async (tx) => {
      await lockPricingRules(tx, storeId);
      const existing = await findRule(id, storeId, tx);
      if (!existing) {
        const scoped = await findSubcategoryRule(id, storeId, tx);
        if (!scoped) return apiError("Aturan harga tidak ditemukan", 404, { code: "NotFound" });
        await tx.subcategoryCustomerPricingRule.update({ where: { id: scoped.id }, data: { isActive: false, updatedBy: user.id } });
        return apiNoContent();
      }
      await tx.categoryCustomerPricingRule.update({ where: { id: existing.id }, data: { isActive: false, updatedBy: user.id } });
      return apiNoContent();
    }, pricingRuleTransactionOptions);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to delete pricing rule:", error);
    return apiError("Aturan harga belum berhasil dinonaktifkan", 500, {
      code: "InternalError",
    });
  }
}
