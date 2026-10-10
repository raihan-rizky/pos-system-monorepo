import {
  priceProductForCustomerType,
  type CategoryCustomerPricingMode,
  type PricingCustomerType,
} from "./pricing-rules";

export const CUSTOMER_TARGET_LABELS: Record<PricingCustomerType, string> = {
  ALL: "Semua pelanggan",
  UMUM: "Umum",
  AGEN: "Agen",
  INDUSTRI: "Industri",
  PEMERINTAH: "Pemerintah",
};
export const PRICING_METHODS = [
  {
    mode: "COST_PLUS_FLAT",
    label: "Modal + rupiah",
    valueLabel: "Tambahan (Rp)",
    description: "Modal unit terkecil ditambah nominal ini.",
  },
  {
    mode: "COST_PLUS_PERCENT",
    label: "Modal + persen",
    valueLabel: "Tambahan (%)",
    description: "Modal unit terkecil ditambah persentase ini.",
  },
  {
    mode: "FLAT_DISCOUNT",
    label: "Diskon rupiah",
    valueLabel: "Diskon (Rp)",
    description: "Potongan dari harga jual normal.",
  },
  {
    mode: "PERCENT_DISCOUNT",
    label: "Diskon persen",
    valueLabel: "Diskon (%)",
    description: "Potongan persentase dari harga jual normal.",
  },
] satisfies {
  mode: CategoryCustomerPricingMode;
  label: string;
  valueLabel: string;
  description: string;
}[];

export interface PricingFormState {
  categoryId: string;
  unit: string;
  customerTypes: readonly PricingCustomerType[];
  brandId: string;
  mode: CategoryCustomerPricingMode;
  value: string;
  isActive: boolean;
}
export type PricingFormErrors = Partial<
  Record<"categoryId" | "unit" | "customerTypes" | "value", string>
>;
export interface PricingPreviewProduct {
  id: string;
  name: string;
  unit: string;
  price: number;
  baseCostPrice: number | null;
  baseCostUnit: string | null;
  brandId: string | null;
}

export function getPricingMethod(mode: CategoryCustomerPricingMode) {
  return PRICING_METHODS.find((method) => method.mode === mode)!;
}

export function toggleCustomerTarget(
  current: readonly PricingCustomerType[],
  target: PricingCustomerType,
): PricingCustomerType[] {
  if (target === "ALL") return current.includes("ALL") ? [] : ["ALL"];
  const selected = current.filter((type) => type !== "ALL");
  return selected.includes(target)
    ? selected.filter((type) => type !== target)
    : [...selected, target];
}

export function validatePricingForm(form: PricingFormState): PricingFormErrors {
  const errors: PricingFormErrors = {};
  if (!form.categoryId) errors.categoryId = "Pilih kategori terlebih dahulu.";
  if (!form.customerTypes.length)
    errors.customerTypes = "Pilih setidaknya satu tipe pelanggan.";
  if (form.mode.startsWith("COST_PLUS") && !form.unit.trim())
    errors.unit = "Pilih satuan untuk rumus modal.";
  const value = Number(form.value);
  if (!form.value.trim() || !Number.isFinite(value) || value < 0)
    errors.value = "Isi nominal atau persentase yang valid, minimal 0.";
  else if (!form.mode.startsWith("COST_PLUS") && value <= 0)
    errors.value = "Diskon harus lebih dari 0.";
  else if (form.mode === "PERCENT_DISCOUNT" && value > 100)
    errors.value = "Diskon maksimal 100%.";
  return errors;
}

export function previewPricingForm(
  form: PricingFormState,
  product: PricingPreviewProduct,
) {
  const missingBaseCost =
    form.mode.startsWith("COST_PLUS") &&
    (product.baseCostPrice == null ||
      !Number.isFinite(product.baseCostPrice) ||
      product.baseCostPrice < 0 ||
      !product.baseCostUnit);
  if (missingBaseCost || Object.keys(validatePricingForm(form)).length)
    return { price: product.price, missingBaseCost };
  const customerType =
    form.customerTypes.find((type) => type !== "ALL") ?? "UMUM";
  const result = priceProductForCustomerType(
    { ...product, categoryId: form.categoryId },
    customerType,
    [
      {
        id: "preview",
        categoryId: form.categoryId,
        customerType: "ALL",
        customerTypes: [...form.customerTypes],
        mode: form.mode,
        value: Number(form.value),
        unit: form.unit || null,
        brandId: form.brandId || null,
        isActive: true,
      },
    ],
  );
  return { price: result.unitPrice, missingBaseCost };
}

export function pricingFormRuleLabel(
  mode: CategoryCustomerPricingMode,
  value: number,
) {
  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(value);
  if (mode === "COST_PLUS_FLAT") return `Modal + Rp${formatted}`;
  if (mode === "COST_PLUS_PERCENT") return `Modal + ${formatted}%`;
  if (mode === "FLAT_DISCOUNT") return `Diskon Rp${formatted}`;
  return `Diskon ${formatted}%`;
}
