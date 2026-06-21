export const CUSTOMER_TYPES = ["UMUM", "AGEN", "INDUSTRI", "PEMERINTAH"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const PRICING_MODES = ["FLAT_DISCOUNT", "PERCENT_DISCOUNT"] as const;
export type CategoryCustomerPricingMode = (typeof PRICING_MODES)[number];

export interface CategoryPricingRule {
  id: string;
  categoryId: string;
  categoryName?: string | null;
  customerType: CustomerType;
  mode: CategoryCustomerPricingMode;
  value: number;
  isActive: boolean;
}

export interface PriceableProduct {
  categoryId: string;
  categoryName?: string | null;
  price: number;
  hargaDinas?: number | null;
}

export interface AppliedCategoryPricing {
  ruleId: string;
  customerType: CustomerType;
  categoryId: string;
  categoryName: string | null;
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

export function isPricingMode(value: string | null | undefined): value is CategoryCustomerPricingMode {
  return PRICING_MODES.includes(value as CategoryCustomerPricingMode);
}

function roundCurrency(value: number) {
  return Math.max(0, Math.round(value * 100) / 100);
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
  input: { customerType: CustomerType; categoryId: string },
) {
  return rules.find(
    (rule) =>
      rule.isActive &&
      rule.customerType === input.customerType &&
      rule.categoryId === input.categoryId,
  ) ?? null;
}

export function applyCategoryPricingRule(
  product: PriceableProduct,
  customerType: CustomerType,
  rule: CategoryPricingRule | null,
): PricedProductLine {
  const originalUnitPrice = roundCurrency(product.price);
  if (!rule || !rule.isActive || rule.customerType !== customerType || rule.categoryId !== product.categoryId) {
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
  customerType: CustomerType;
  mode: CategoryCustomerPricingMode;
  value: number;
}) {
  if (input.ruleId === "harga-dinas") {
    return "Harga Dinas";
  }
  if (input.mode === "FLAT_DISCOUNT") {
    return `${input.customerType} diskon Rp ${input.value.toLocaleString("id-ID")}`;
  }
  return `${input.customerType} diskon ${input.value}%`;
}
