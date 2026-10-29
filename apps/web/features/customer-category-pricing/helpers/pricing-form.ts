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
    mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT",
    label: "HPP masing-masing satuan + persen − persen",
    valueLabel: "Tambahan (%)",
    description: "HPP tiap satuan ditambah persen, lalu dipotong persen. Isi potongan 0% untuk tambahan saja.",
  },
  {
    mode: "COST_PLUS_FLAT",
    label: "HPP satuan terkecil + rupiah",
    valueLabel: "Tambahan (Rp)",
    description: "HPP satuan terkecil ditambah nominal ini, tanpa konversi isi kemasan.",
  },
  {
    mode: "COST_PLUS_PERCENT",
    label: "HPP satuan terkecil + persen",
    valueLabel: "Tambahan (%)",
    description: "HPP satuan terkecil ditambah persentase ini, tanpa konversi isi kemasan.",
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
  units?: string[];
  customerTypes: readonly PricingCustomerType[];
  brandId: string;
  mode: CategoryCustomerPricingMode;
  value: string;
  discountPercent?: string;
  isActive: boolean;
}
export type PricingFormErrors = Partial<
  Record<"categoryId" | "unit" | "customerTypes" | "value" | "discountPercent", string>
>;
export interface PricingPreviewProduct {
  id: string;
  name: string;
  unit: string;
  price: number;
  costPrice?: number | null;
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
  const value = Number(form.value);
  if (!form.value.trim() || !Number.isFinite(value) || value < 0)
    errors.value = "Isi nominal atau persentase yang valid, minimal 0.";
  else if ((form.mode === "FLAT_DISCOUNT" || form.mode === "PERCENT_DISCOUNT") && value <= 0)
    errors.value = "Diskon harus lebih dari 0.";
  else if (form.mode === "PERCENT_DISCOUNT" && value > 100)
    errors.value = "Diskon maksimal 100%.";
  if (form.mode === "UNIT_COST_PLUS_PERCENT_DISCOUNT") {
    const discount = Number(form.discountPercent);
    if (!form.discountPercent?.trim() || !Number.isFinite(discount) || discount < 0 || discount > 100)
      errors.discountPercent = "Isi potongan dari 0 sampai 100%.";
  }
  return errors;
}

export function previewPricingForm(
  form: PricingFormState,
  product: PricingPreviewProduct,
) {
  const missingBaseCost = form.mode === "UNIT_COST_PLUS_PERCENT_DISCOUNT"
    ? product.costPrice == null || !Number.isFinite(product.costPrice) || product.costPrice < 0
    :
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
        ...(form.mode === "UNIT_COST_PLUS_PERCENT_DISCOUNT" ? { discountPercent: Number(form.discountPercent) } : {}),
        unit: form.unit || null,
        units: form.units,
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
  discountPercent?: number,
) {
  const formatted = new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(value);
  if (mode === "UNIT_COST_PLUS_PERCENT_DISCOUNT") return `HPP masing-masing satuan + ${formatted}% lalu − ${new Intl.NumberFormat("id-ID").format(discountPercent ?? 0)}%`;
  if (mode === "COST_PLUS_FLAT") return `HPP satuan terkecil + Rp${formatted}`;
  if (mode === "COST_PLUS_PERCENT") return `HPP satuan terkecil + ${formatted}%`;
  if (mode === "FLAT_DISCOUNT") return `Diskon Rp${formatted}`;
  return `Diskon ${formatted}%`;
}
