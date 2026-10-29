import type { CreateProductInput, UpdateProductInput } from "@/hooks/useProducts";
import { buildAdditionalUnitInputs, type UnitVariantDraft } from "./product-unit-variants";

export type ProductFormMode = "create" | "edit";

export type ProductFormValues = {
  name: string;
  description?: string;
  sku: string;
  categoryId: string;
  brandId?: string;
  price: string;
  costPrice: string;
  hargaDinas: string;
  hargaAgen: string;
  minStock: string;
  unit: string;
  unitMultiplierToBase: string;
  smallestUnit: string;
  smallestSku: string;
  smallestBarcode: string;
  smallestPrice: string;
  smallestCostPrice: string;
  includeSmallestUnitVariant: boolean;
  stock: string;
  size: string;
  material: string;
  imageUrl: string;
  additionalUnits?: UnitVariantDraft[];
};

type ProductDetailsUpdatePayload = Omit<
  UpdateProductInput,
  "id" | "price" | "costPrice" | "priceChangeNote"
>;

export function changedProductFields<T extends object>(current: T, initial: T): Partial<T> {
  const changed: Partial<T> = {};
  for (const key of Object.keys(current) as Array<keyof T>) {
    if (!Object.is(current[key], initial[key])) changed[key] = current[key];
  }
  return changed;
}

function productDetailFields(formData: ProductFormValues) {
  return {
    name: formData.name,
    description: formData.description?.trim() || null,
    sku: formData.sku,
    categoryId: formData.categoryId,
    brandId: formData.brandId || null,
    minStock: Number(formData.minStock),
    stock: Number(formData.stock),
    unit: formData.unit,
    unitMultiplierToBase: Number(formData.unitMultiplierToBase || "1"),
    size: formData.size || undefined,
    material: formData.material || undefined,
    imageUrl: formData.imageUrl || undefined,
    hargaDinas: formData.hargaDinas ? Number(formData.hargaDinas) : null,
    hargaAgen: formData.hargaAgen ? Number(formData.hargaAgen) : null,
  };
}

export function buildProductFormPayload(
  formData: ProductFormValues,
  mode: "create",
): CreateProductInput;
export function buildProductFormPayload(
  formData: ProductFormValues,
  mode: "edit",
  initialFormData?: ProductFormValues,
): ProductDetailsUpdatePayload;
export function buildProductFormPayload(
  formData: ProductFormValues,
  mode: ProductFormMode,
  initialFormData?: ProductFormValues,
): CreateProductInput | ProductDetailsUpdatePayload {
  const common = productDetailFields(formData);

  if (mode === "edit") {
    return initialFormData ? changedProductFields(common, productDetailFields(initialFormData)) : common;
  }

  return {
    ...common,
    ...(formData.additionalUnits?.length
      ? { additionalUnitVariants: buildAdditionalUnitInputs(formData, formData.additionalUnits) }
      : {}),
    price: Number(formData.price),
    costPrice: formData.costPrice ? Number(formData.costPrice) : undefined,
    smallestUnitVariant:
      formData.includeSmallestUnitVariant
        ? {
            unit: formData.smallestUnit,
            sku: formData.smallestSku,
            barcode: formData.smallestBarcode || undefined,
            price: Number(formData.smallestPrice),
            costPrice: formData.smallestCostPrice
              ? Number(formData.smallestCostPrice)
              : undefined,
            multiplierFromPackaging: Number(formData.unitMultiplierToBase),
          }
        : undefined,
  };
}
