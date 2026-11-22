export type CatalogGroup = "ATK" | "PERCETAKAN";

export interface CatalogSubcategory {
  id: string;
  group: CatalogGroup;
  name: string;
  legacyCategoryId: string | null;
}

export interface LegacyCategory {
  id: string;
  name: string;
}
