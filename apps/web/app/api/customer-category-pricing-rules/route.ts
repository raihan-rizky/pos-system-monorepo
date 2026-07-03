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
  isPricingMode,
  type CategoryCustomerPricingMode,
  type CustomerType,
  type PricingCustomerType,
  normalizePricingUnit,
} from "@/features/customer-category-pricing/helpers/pricing-rules";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:customer-category-pricing-rules");

const ruleSchema = z
  .object({
    categoryId: z.string().min(1, "Kategori wajib dipilih"),
    customerType: z.string().refine(isPricingCustomerType, "Tipe pelanggan tidak valid"),
    unit: z.string().optional().nullable(),
    brandId: z.string().optional().nullable(),
    mode: z.string().refine(isPricingMode, "Mode harga tidak valid"),
    value: z.coerce.number(),
    isActive: z.boolean().optional().default(true),
  })
  .superRefine((input, ctx) => {
    if (input.mode === "FLAT_DISCOUNT" && input.value <= 0) {
      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message: "Diskon tetap harus lebih dari 0",
      });
    }
    if (
      input.mode === "PERCENT_DISCOUNT" &&
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
  excludeId?: string;
}) {
  const duplicate = await db.categoryCustomerPricingRule.findFirst({
    where: {
      storeId: input.storeId,
      categoryId: input.categoryId,
      customerType: toStoredCustomerType(input.customerType),
      unit: normalizePricingUnit(input.unit),
      brandId: input.brandId ?? null,
      isActive: true,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    select: { id: true },
  });
  return Boolean(duplicate);
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
        ...(customerType ? { customerType: toStoredCustomerType(customerType as PricingCustomerType) } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(brandId ? { brandId } : {}),
      },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        brand: { select: { id: true, name: true, normalizedName: true } },
      },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    });

    return apiCollection(rules.map((rule) => serializeRule(rule as RuleWithCategory)));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch pricing rules:", error);
    return apiError("Failed to fetch pricing rules", 500, {
      code: "InternalError",
    });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("OWNER");
    const storeId = user.storeId || "store-main";
    const body = await request.json();
    const parsed = ruleSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const data = parsed.data as z.infer<typeof ruleSchema> & {
      customerType: PricingCustomerType;
      mode: CategoryCustomerPricingMode;
    };
    const normalizedUnit = normalizePricingUnit(data.unit);
    const brandId = data.brandId || null;

    if (!(await assertCategoryExists(data.categoryId))) {
      return apiError("Kategori tidak ditemukan", 404, { code: "NotFound" });
    }
    if (!(await assertBrandExists(storeId, brandId))) {
      return apiError("Merek tidak ditemukan", 404, { code: "NotFound" });
    }

    if (
      data.isActive &&
      (await hasDuplicateActiveRule({
        storeId,
        categoryId: data.categoryId,
        customerType: data.customerType,
        unit: normalizedUnit,
        brandId,
      }))
    ) {
      return apiError(
        "Aturan aktif untuk tipe pelanggan dan kategori ini sudah ada",
        409,
        { code: "Conflict" },
      );
    }

    const created = await db.categoryCustomerPricingRule.create({
      data: {
        storeId,
        categoryId: data.categoryId,
        customerType: toStoredCustomerType(data.customerType),
        unit: normalizedUnit,
        brandId,
        mode: data.mode,
        value: data.value,
        isActive: data.isActive,
        createdBy: user.id,
        updatedBy: user.id,
      },
      include: {
        category: { select: { id: true, name: true, icon: true, color: true } },
        brand: { select: { id: true, name: true, normalizedName: true } },
      },
    });

    return NextResponse.json(serializeRule(created as RuleWithCategory), {
      status: 201,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to create pricing rule:", error);
    return apiError("Failed to create pricing rule", 500, {
      code: "InternalError",
    });
  }
}
