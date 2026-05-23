import type { CreateProductInput, UpdateProductInput } from "@/hooks/useProducts";

export type ProductFormMode = "create" | "edit";

export type ProductFormValues = {
  name: string;
  sku: string;
  categoryId: string;
  price: string;
  costPrice: string;
  minStock: string;
  unit: string;
  stock: string;
  size: string;
  material: string;
  imageUrl: string;
};

type ProductDetailsUpdatePayload = Omit<
  UpdateProductInput,
  "id" | "price" | "costPrice" | "priceChangeNote"
>;

export function buildProductFormPayload(
  formData: ProductFormValues,
  mode: "create",
): CreateProductInput;
export function buildProductFormPayload(
  formData: ProductFormValues,
  mode: "edit",
): ProductDetailsUpdatePayload;
export function buildProductFormPayload(
  formData: ProductFormValues,
  mode: ProductFormMode,
): CreateProductInput | ProductDetailsUpdatePayload {
  const common = {
    name: formData.name,
    sku: formData.sku,
    categoryId: formData.categoryId,
    minStock: Number(formData.minStock),
    stock: Number(formData.stock),
    unit: formData.unit,
    size: formData.size || undefined,
    material: formData.material || undefined,
    imageUrl: formData.imageUrl || undefined,
  };

  if (mode === "edit") {
    return common;
  }

  return {
    ...common,
    price: Number(formData.price),
    costPrice: formData.costPrice ? Number(formData.costPrice) : undefined,
  };
}
