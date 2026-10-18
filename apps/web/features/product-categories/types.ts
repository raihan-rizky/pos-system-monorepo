export type SalesGroup = "ATK" | "PAPER" | "CARTRIDGE" | "INK" | "OTHER";

export interface CategoryDraft {
  name: string;
  icon: string | null;
  color: string | null;
  order: number;
  salesGroup: SalesGroup;
}

export interface ManagedCategory extends CategoryDraft {
  id: string;
  _count: { products: number };
}

export type CategoryAction =
  | { action: "create"; categories: CategoryDraft[] }
  | { action: "update"; categories: ({ id: string } & Partial<CategoryDraft>)[] }
  | { action: "preview-delete"; categoryIds: string[]; destinations: Record<string, string> }
  | { action: "delete"; categoryIds: string[]; destinations: Record<string, string>; token: string; acknowledged: boolean; confirmation: string }
  | { action: "preview-move"; productIds: string[]; targetCategoryId: string }
  | { action: "move"; productIds: string[]; targetCategoryId: string; token: string; acknowledged: boolean };

export interface PricingRuleImpact {
  id: string;
  storeId: string;
  storeName: string;
  customerTypes: string[];
  unit: string | null;
  brandName: string | null;
  mode: string;
  value: string;
  isActive: boolean;
}

export interface DeletePreview {
  kind: "delete";
  token: string;
  expiresAt: number;
  categories: {
    id: string;
    name: string;
    targetCategoryId: string | null;
    targetCategoryName: string | null;
    products: number;
    activeProducts: number;
    inactiveProducts: number;
    rules: PricingRuleImpact[];
    stores: { id: string; name: string; products: number; rules: number }[];
  }[];
  totals: { categories: number; products: number; activeProducts: number; inactiveProducts: number; rules: number; stores: number };
  stores: { id: string; name: string; products: number; rules: number }[];
}

export interface MovePreview {
  kind: "move";
  token: string;
  expiresAt: number;
  targetCategoryId: string;
  targetCategoryName: string;
  totals: { products: number; unchanged: number };
  origins: { id: string; name: string; products: number }[];
}

export interface CategoryActionResult {
  message: string;
  categories?: ManagedCategory[];
  deletedCategories?: number;
  movedProducts?: number;
  deletedRules?: number;
  unchangedProducts?: number;
}
