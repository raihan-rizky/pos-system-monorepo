import { db } from "@pos/db";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";
import { apiError } from "@/lib/api/responses";
import { normalizePricingUnit, normalizePricingUnits } from "@/features/customer-category-pricing/helpers/pricing-rules";
import { loadProductBaseCosts } from "@/features/customer-category-pricing/helpers/base-cost";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:customer-category-pricing-rules:scope-options");
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    // Previews include modal, so they are only available to the rule editor's owner role.
    const user = await requireRole("OWNER");
    const storeId = user.storeId || "store-main";
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId");
    if (!categoryId) return apiError("Pilih kategori terlebih dahulu", 422, { code: "ValidationError" });
    const view = searchParams.get("view") ?? "all";
    if (!["all", "units", "preview"].includes(view)) {
      return apiError("Pilihan data tidak valid", 422, { code: "ValidationError" });
    }
    const selectedUnits = normalizePricingUnits(searchParams.getAll("unit"));
    const unit = selectedUnits.length === 1 ? selectedUnits[0] : null;
    const brandId = searchParams.get("brandId");
    const where = { storeId, categoryId, isActive: true };
    const [productUnits, savedUnits, products] = await Promise.all([
      view === "preview" ? [] : db.product.findMany({ where, select: { unit: true }, distinct: ["unit"] }),
      view === "preview" ? [] : db.categoryCustomerPricingRule.findMany({ where: { storeId, categoryId }, select: { unit: true, units: true } }),
      view === "units" ? [] : db.product.findMany({
        where: { ...where, ...(unit ? { unit: { equals: unit, mode: "insensitive" as const } } : selectedUnits.length ? { OR: selectedUnits.map((value) => ({ unit: { equals: value, mode: "insensitive" as const } })) } : {}), ...(brandId ? { brandId } : {}) },
        ...(unit ? {} : { distinct: ["unit" as const] }),
        take: 3, orderBy: [{ name: "asc" }, { id: "asc" }],
        select: { id: true, name: true, storeId: true, unit: true, price: true, costPrice: true, brandId: true, stockGroupId: true, stockGroup: { select: { baseUnit: true, storeId: true } } },
      }),
    ]);
    const units = [...new Set([
      ...productUnits.map((row) => normalizePricingUnit(row.unit)).filter((value): value is string => value !== null),
      ...savedUnits.flatMap((row) => normalizePricingUnits(row.units, row.unit)),
    ])].sort();
    if (view === "units") return Response.json({ data: { units, products: [] } });
    const baseCosts = await loadProductBaseCosts(db, products);
    return Response.json({ data: { units, products: products.map((product) => ({ id: product.id, name: product.name, unit: product.unit, price: Number(product.price), costPrice: product.costPrice == null ? null : Number(product.costPrice), brandId: product.brandId, ...baseCosts.get(product.id) })) } });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to fetch pricing scope options:", error);
    return apiError("Contoh harga belum berhasil dimuat", 500, { code: "InternalError" });
  }
}
