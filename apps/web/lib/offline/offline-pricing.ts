import { isPricingCustomerType, isPricingMode } from "@/features/customer-category-pricing/helpers/pricing-rules";
import type { CustomerCategoryPricingRule } from "@/hooks/useCustomerCategoryPricingRules";
import type { Product } from "@/hooks/useProducts";
import { offlineDb, type OfflineCatalogIdentity } from "./offline-db";
import { validatePriceRoundingSettings, type PriceRoundingSettings } from "@/features/product-price-rounding/rounding";

export type OfflineCatalogPricing = {
  specialPricingEnabled: boolean;
  rounding: PriceRoundingSettings;
  rules: CustomerCategoryPricingRule[];
};

export function isOfflineCatalogPricing(value: unknown, storeId: string): value is OfflineCatalogPricing {
  if (!value || typeof value !== "object") return false;
  const pricing = value as { specialPricingEnabled?: unknown; rounding?: unknown; rules?: unknown };
  if (typeof pricing.specialPricingEnabled !== "boolean" || !Array.isArray(pricing.rules)) return false;
  if (!pricing.rounding || typeof pricing.rounding !== "object" ||
      !Array.isArray((pricing.rounding as { excludedCategoryIds?: unknown }).excludedCategoryIds)) return false;
  try { validatePriceRoundingSettings(pricing.rounding as PriceRoundingSettings); } catch { return false; }
  return pricing.rules.every((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const rule = entry as Record<string, unknown>;
    const category = rule.category as Record<string, unknown> | null;
    return typeof rule.id === "string" && rule.id.length > 0 && rule.storeId === storeId &&
      (rule.scope === undefined || rule.scope === "CATEGORY" || rule.scope === "SUBCATEGORY") &&
      typeof rule.categoryId === "string" && rule.categoryId.length > 0 &&
      category !== null && typeof category === "object" && category.id === rule.categoryId && typeof category.name === "string" &&
      typeof rule.customerType === "string" && isPricingCustomerType(rule.customerType) &&
      (rule.customerTypes === undefined || (Array.isArray(rule.customerTypes) && rule.customerTypes.every((type: unknown) => typeof type === "string" && isPricingCustomerType(type)))) &&
      typeof rule.mode === "string" && isPricingMode(rule.mode) &&
      typeof rule.value === "number" && Number.isFinite(rule.value) && rule.isActive === true;
  });
}

export async function getOfflineCatalogPricing(identity: OfflineCatalogIdentity): Promise<OfflineCatalogPricing> {
  return (await getOfflineCheckoutCatalog(identity)).pricing;
}

export async function getOfflineCheckoutCatalog(identity: OfflineCatalogIdentity): Promise<{ pricing: OfflineCatalogPricing; products: Product[] }> {
  const snapshot = await offlineDb.catalogSnapshots.get(`${identity.cashierId}:${identity.storeId}`);
  if (!snapshot || snapshot.cashierId !== identity.cashierId || snapshot.storeId !== identity.storeId ||
      !isOfflineCatalogPricing(snapshot.pricing, identity.storeId)) {
    throw new Error("Aturan harga offline belum siap. Hubungkan perangkat dan siapkan ulang katalog.");
  }
  const groups = snapshot.products as unknown as Product[];
  const products = groups.flatMap((group) => group.variants?.length
    ? group.variants.map((variant) => ({ ...group, ...variant, variants: undefined }))
    : [group]);
  return { pricing: snapshot.pricing, products };
}
