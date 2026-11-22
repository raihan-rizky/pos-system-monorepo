import { db, type Prisma } from "@pos/db";
import type { CatalogGroup } from "../types";

export type ClassificationProductFilters = {
  search?: string;
  legacyCategoryId?: string;
  status?: "all" | "classified" | "unclassified";
  group?: CatalogGroup;
  subcategoryId?: string;
  page?: number;
  limit?: number;
};

export async function listClassificationProducts(storeId: string, filters: ClassificationProductFilters) {
  const page = Number.isInteger(filters.page) ? Math.max(1, filters.page!) : 1;
  const limit = Number.isInteger(filters.limit) ? Math.min(100, Math.max(1, filters.limit!)) : 25;
  if (filters.status === "unclassified" && (filters.group || filters.subcategoryId)) {
    return { groups: [], total: 0, page, pageCount: 1 };
  }
  const search = filters.search?.trim().slice(0, 150) ?? "";
  const where: Prisma.ProductWhereInput = {
    storeId,
    ...(filters.legacyCategoryId ? { categoryId: filters.legacyCategoryId } : {}),
    ...(filters.subcategoryId ? { catalogSubcategoryId: filters.subcategoryId }
      : filters.status === "classified" ? { catalogSubcategoryId: { not: null } }
        : filters.status === "unclassified" ? { catalogSubcategoryId: null } : {}),
    ...(filters.group ? { catalogSubcategory: { is: { group: filters.group } } } : {}),
    ...(search ? { OR: [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
      { barcode: { contains: search, mode: "insensitive" } },
    ] } : {}),
  };
  const matches = await db.product.findMany({
    where,
    select: { id: true, name: true, stockGroupId: true, stockGroup: { select: { displayName: true } } },
  });
  const groups = new Map<string, { id: string; name: string; stockGroupId: string | null; productId: string | null }>();
  for (const product of matches) {
    const key = product.stockGroupId ? `group:${product.stockGroupId}` : `product:${product.id}`;
    if (!groups.has(key)) groups.set(key, {
      id: key,
      name: product.stockGroup?.displayName || product.name,
      stockGroupId: product.stockGroupId,
      productId: product.stockGroupId ? null : product.id,
    });
  }
  const ordered = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "id") || a.id.localeCompare(b.id));
  const selected = ordered.slice((page - 1) * limit, page * limit);
  const stockGroupIds = selected.flatMap((group) => group.stockGroupId ? [group.stockGroupId] : []);
  const productIds = selected.flatMap((group) => group.productId ? [group.productId] : []);
  const members = selected.length ? await db.product.findMany({
    where: { storeId, OR: [
      ...(stockGroupIds.length ? [{ stockGroupId: { in: stockGroupIds } }] : []),
      ...(productIds.length ? [{ id: { in: productIds } }] : []),
    ] },
    include: {
      category: { select: { id: true, name: true } },
      catalogSubcategory: { select: { id: true, group: true, name: true } },
    },
    orderBy: [{ name: "asc" }, { unit: "asc" }, { id: "asc" }],
  }) : [];
  return {
    groups: selected.map((group) => {
      const products = members.filter((product) => group.stockGroupId
        ? product.stockGroupId === group.stockGroupId : product.id === group.productId);
      return {
        id: group.id,
        name: group.name,
        imageUrl: products.find((product) => product.imageUrl)?.imageUrl ?? null,
        units: products.map((product) => ({
          id: product.id, name: product.name, unit: product.unit, imageUrl: product.imageUrl,
          isActive: product.isActive, legacyCategoryName: product.category.name,
          catalogSubcategory: product.catalogSubcategory,
        })),
      };
    }),
    total: ordered.length,
    page,
    pageCount: Math.max(1, Math.ceil(ordered.length / limit)),
  };
}
