export const CUSTOMER_TYPES = ["UMUM", "AGEN", "INDUSTRI", "PEMERINTAH"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export const PRICING_CUSTOMER_TYPES = ["ALL", ...CUSTOMER_TYPES] as const;
export type PricingCustomerType = (typeof PRICING_CUSTOMER_TYPES)[number];

export const PRICING_MODES = ["FLAT_DISCOUNT", "PERCENT_DISCOUNT"] as const;
export type CategoryCustomerPricingMode = (typeof PRICING_MODES)[number];

export interface CategoryPricingRule {
  id: string;
  categoryId: string;
  categoryName?: string | null;
  customerType: PricingCustomerType;
  mode: CategoryCustomerPricingMode;
  value: number;
  isActive: boolean;
  unit?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  updatedAt?: string | Date;
}

export interface PriceableProduct {
  categoryId: string;
  categoryName?: string | null;
  price: number;
  hargaDinas?: number | null;
  hargaAgen?: number | null;
  unit?: string | null;
  brandId?: string | null;
  brandName?: string | null;
}

export interface AppliedCategoryPricing {
  ruleId: string;
  customerType: CustomerType;
  categoryId: string;
  categoryName: string | null;
  unit?: string | null;
  brandId?: string | null;
  brandName?: string | null;
  mode: CategoryCustomerPricingMode;
  value: number;
  originalUnitPrice: number;
  appliedUnitPrice: number;
}

export interface PricedProductLine {
  unitPrice: number;
  appliedPricing: AppliedCategoryPricing | null;
}

export function isCustomerType(value: string | null | undefined): value is CustomerType {
  return CUSTOMER_TYPES.includes(value as CustomerType);
}

export function isPricingCustomerType(
  value: string | null | undefined,
): value is PricingCustomerType {
  return PRICING_CUSTOMER_TYPES.includes(value as PricingCustomerType);
}

export function isPricingMode(value: string | null | undefined): value is CategoryCustomerPricingMode {
  return PRICING_MODES.includes(value as CategoryCustomerPricingMode);
}

function roundCurrency(value: number) {
  return Math.max(0, Math.round(value * 100) / 100);
}

function normalizeScopeText(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function normalizePricingUnit(value: string | null | undefined) {
  return normalizeScopeText(value);
}

export function resolveCheckoutCustomerType(customerType?: CustomerType | null): CustomerType {
  return customerType ?? "UMUM";
}

export function isRegularPriceFallback(input: {
  appliedPricing: AppliedCategoryPricing | null;
  customerType: CustomerType;
}) {
  if (input.customerType === "UMUM") return false;
  return input.appliedPricing === null;
}

export function findMatchingCategoryPricingRule(
  rules: CategoryPricingRule[],
  input: {
    customerType: CustomerType;
    categoryId: string;
    unit?: string | null;
    brandId?: string | null;
  },
) {
  const productUnit = normalizePricingUnit(input.unit);
  const productBrandId = input.brandId ?? null;

  const matches = rules
    .map((rule, index) => {
      if (!rule.isActive || rule.categoryId !== input.categoryId) return null;
      if (rule.customerType !== "ALL" && rule.customerType !== input.customerType) {
        return null;
      }

      const ruleUnit = normalizePricingUnit(rule.unit);
      if (ruleUnit && ruleUnit !== productUnit) return null;

      const ruleBrandId = rule.brandId ?? null;
      if (ruleBrandId && ruleBrandId !== productBrandId) return null;

      const hasSpecificCustomer = rule.customerType !== "ALL";
      const hasSpecificUnit = Boolean(ruleUnit);
      const hasSpecificBrand = Boolean(ruleBrandId);
      const updatedAtTime =
        rule.updatedAt == null ? 0 : new Date(rule.updatedAt).getTime() || 0;

      return {
        rule,
        index,
        updatedAtTime,
        specificity:
          Number(hasSpecificCustomer) +
          Number(hasSpecificUnit) +
          Number(hasSpecificBrand),
        hasSpecificCustomer,
        hasSpecificUnit,
        hasSpecificBrand,
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> =>
      Boolean(candidate),
    );

  matches.sort((a, b) => {
    if (b.specificity !== a.specificity) return b.specificity - a.specificity;
    if (b.hasSpecificCustomer !== a.hasSpecificCustomer) {
      return Number(b.hasSpecificCustomer) - Number(a.hasSpecificCustomer);
    }
    if (b.hasSpecificUnit !== a.hasSpecificUnit) {
      return Number(b.hasSpecificUnit) - Number(a.hasSpecificUnit);
    }
    if (b.hasSpecificBrand !== a.hasSpecificBrand) {
      return Number(b.hasSpecificBrand) - Number(a.hasSpecificBrand);
    }
    if (b.updatedAtTime !== a.updatedAtTime) {
      return b.updatedAtTime - a.updatedAtTime;
    }
    return a.index - b.index;
  });

  return matches[0]?.rule ?? null;
}

export function applyCategoryPricingRule(
  product: PriceableProduct,
  customerType: CustomerType,
  rule: CategoryPricingRule | null,
): PricedProductLine {
  const originalUnitPrice = roundCurrency(product.price);
  const ruleUnit = normalizePricingUnit(rule?.unit);
  const productUnit = normalizePricingUnit(product.unit);
  const ruleBrandId = rule?.brandId ?? null;
  if (
    !rule ||
    !rule.isActive ||
    (rule.customerType !== "ALL" && rule.customerType !== customerType) ||
    rule.categoryId !== product.categoryId ||
    (ruleUnit && ruleUnit !== productUnit) ||
    (ruleBrandId && ruleBrandId !== (product.brandId ?? null))
  ) {
    return { unitPrice: originalUnitPrice, appliedPricing: null };
  }

  const appliedUnitPrice =
    rule.mode === "FLAT_DISCOUNT"
      ? roundCurrency(originalUnitPrice - rule.value)
      : roundCurrency(originalUnitPrice * (1 - rule.value / 100));

  if (appliedUnitPrice <= 0) {
    return { unitPrice: originalUnitPrice, appliedPricing: null };
  }

  return {
    unitPrice: appliedUnitPrice,
    appliedPricing: {
      ruleId: rule.id,
      customerType,
      categoryId: product.categoryId,
      categoryName: product.categoryName ?? rule.categoryName ?? null,
      unit: ruleUnit,
      brandId: ruleBrandId,
      brandName: rule.brandName ?? product.brandName ?? null,
      mode: rule.mode,
      value: roundCurrency(rule.value),
      originalUnitPrice,
      appliedUnitPrice,
    },
  };
}

export function priceProductForCustomerType(
  product: PriceableProduct,
  customerType: CustomerType,
  rules: CategoryPricingRule[],
): PricedProductLine {
  if (
    customerType === "AGEN" &&
    product.hargaAgen != null &&
    product.hargaAgen > 0
  ) {
    const originalUnitPrice = roundCurrency(product.price);
    const appliedUnitPrice = roundCurrency(product.hargaAgen);
    return {
      unitPrice: appliedUnitPrice,
      appliedPricing: {
        ruleId: "harga-agen",
        customerType,
        categoryId: product.categoryId,
        categoryName: product.categoryName ?? null,
        unit: product.unit ?? null,
        brandId: product.brandId ?? null,
        brandName: product.brandName ?? null,
        mode: "FLAT_DISCOUNT",
        value: roundCurrency(originalUnitPrice - appliedUnitPrice),
        originalUnitPrice,
        appliedUnitPrice,
      },
    };
  }

  if (
    customerType === "PEMERINTAH" &&
    product.hargaDinas != null &&
    product.hargaDinas > 0
  ) {
    const originalUnitPrice = roundCurrency(product.price);
    const appliedUnitPrice = roundCurrency(product.hargaDinas);
    return {
      unitPrice: appliedUnitPrice,
      appliedPricing: {
        ruleId: "harga-dinas",
        customerType,
        categoryId: product.categoryId,
        categoryName: product.categoryName ?? null,
        unit: product.unit ?? null,
        brandId: product.brandId ?? null,
        brandName: product.brandName ?? null,
        mode: "FLAT_DISCOUNT",
        value: roundCurrency(originalUnitPrice - appliedUnitPrice),
        originalUnitPrice,
        appliedUnitPrice,
      },
    };
  }

  return applyCategoryPricingRule(
    product,
    customerType,
    findMatchingCategoryPricingRule(rules, {
      customerType,
      categoryId: product.categoryId,
      unit: product.unit,
      brandId: product.brandId,
    }),
  );
}

export function countProductsAtOrBelowFlatDiscount(
  products: Array<{ price: number; isActive?: boolean }>,
  flatDiscount: number,
) {
  return products.filter(
    (product) => product.isActive !== false && product.price <= flatDiscount,
  ).length;
}

function roundPercent(value: number) {
  return Math.round(value * 100) / 100;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function calculateCustomPriceMargin(input: {
  costPrice: number | null | undefined;
  catalogPrice: number;
  customPrice: number;
}) {
  const catalogPrice = roundCurrency(input.catalogPrice);
  const customPrice = roundCurrency(input.customPrice);
  const isChanged = catalogPrice !== customPrice;

  if (input.costPrice == null) {
    return {
      hasCostPrice: false,
      isChanged,
      isBelowCost: false,
      currentProfit: null,
      currentMarginPercent: null,
      customProfit: null,
      customMarginPercent: null,
    };
  }

  const costPrice = roundCurrency(input.costPrice);
  const currentProfit = roundMoney(catalogPrice - costPrice);
  const customProfit = roundMoney(customPrice - costPrice);

  return {
    hasCostPrice: true,
    isChanged,
    isBelowCost: customPrice < costPrice,
    currentProfit,
    currentMarginPercent:
      catalogPrice > 0 ? roundPercent((currentProfit / catalogPrice) * 100) : 0,
    customProfit,
    customMarginPercent:
      customPrice > 0 ? roundPercent((customProfit / customPrice) * 100) : 0,
  };
}

export function canEditCustomPriceForCustomer(
  role: string | null | undefined,
  customerType: CustomerType,
) {
  return (
    (role === "OWNER" || role === "ADMIN" || role === "CASHIER") &&
    (customerType === "INDUSTRI" || customerType === "PEMERINTAH")
  );
}

export function resolveCustomPricedLine(input: {
  pricedLine: PricedProductLine;
  submittedPrice: number | null | undefined;
  role: string | null | undefined;
  customerType: CustomerType;
}) {
  const submittedPrice = input.submittedPrice;
  if (
    submittedPrice == null ||
    !canEditCustomPriceForCustomer(input.role, input.customerType)
  ) {
    return {
      unitPrice: input.pricedLine.unitPrice,
      appliedPricing: input.pricedLine.appliedPricing,
      manualOverrideApplied: false,
    };
  }

  const unitPrice = roundCurrency(submittedPrice);
  return {
    unitPrice,
    appliedPricing: input.pricedLine.appliedPricing
      ? {
          ...input.pricedLine.appliedPricing,
          appliedUnitPrice: unitPrice,
        }
      : null,
    manualOverrideApplied: unitPrice !== input.pricedLine.unitPrice,
  };
}

export function formatPricingRuleLabel(input: {
  ruleId?: string;
  customerType: PricingCustomerType;
  mode: CategoryCustomerPricingMode;
  value: number;
}) {
  if (input.ruleId === "harga-dinas") {
    return "Harga Dinas";
  }
  if (input.ruleId === "harga-agen") {
    return "Harga Agen";
  }
  if (input.mode === "FLAT_DISCOUNT") {
    return `${input.customerType} diskon Rp ${input.value.toLocaleString("id-ID")}`;
  }
  return `${input.customerType} diskon ${input.value}%`;
}
