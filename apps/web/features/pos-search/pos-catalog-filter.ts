import type { Prisma } from "@pos/db";
import type { CatalogGroup, CatalogSubcategory } from "@/features/product-classification/types";

export interface PosCatalogFilter {
  group?: CatalogGroup;
  subcategoryId?: string;
}

type ProductCatalogClassification = {
  catalogSubcategoryId?: string | null;
  catalogSubcategory?: Pick<CatalogSubcategory, "id" | "group"> | null;
  category?: {
    catalogSubcategory?: Pick<CatalogSubcategory, "id" | "group"> | null;
  } | null;
};

export function buildPosCatalogFilterWhere(filter: PosCatalogFilter): Prisma.ProductWhereInput {
  const subcategoryWhere = {
    ...(filter.subcategoryId ? { id: filter.subcategoryId } : {}),
    ...(filter.group ? { group: filter.group } : {}),
  };
  if (Object.keys(subcategoryWhere).length === 0) return {};

  return {
    OR: [
      { catalogSubcategory: { is: subcategoryWhere } },
      {
        catalogSubcategoryId: null,
        category: { catalogSubcategory: { is: subcategoryWhere } },
      },
    ],
  };
}

export function matchesPosCatalogFilter(
  product: ProductCatalogClassification,
  filter: PosCatalogFilter,
): boolean {
  if (!filter.group && !filter.subcategoryId) return true;

  const classification: { id: string; group?: CatalogGroup } | null =
    product.catalogSubcategoryId != null
      ? product.catalogSubcategory ?? { id: product.catalogSubcategoryId }
      : product.category?.catalogSubcategory ?? product.catalogSubcategory ?? null;
  if (!classification) return false;
  if (filter.group && classification.group !== filter.group) return false;
  if (filter.subcategoryId && classification.id !== filter.subcategoryId) return false;
  return true;
}
