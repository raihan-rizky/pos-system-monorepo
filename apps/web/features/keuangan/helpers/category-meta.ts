import type { ExpenseCategory, ExpenseCategoryKey } from "./keuangan-core";

export const CATEGORY_COLORS: Record<ExpenseCategory, string> = {
  SUPPLIES: "#6366F1", // indigo
  UTILITIES: "#06B6D4", // cyan
  RENT: "#0EA5E9", // sky
  SALARY: "#14B8A6", // teal
  TRANSPORT: "#F59E0B", // amber
  MAINTENANCE: "#A855F7", // purple
  CASH_BOND: "#EF4444", // red
  BEVERAGES: "#EC4899", // pink
  OTHER: "#64748B", // slate
};

export const CATEGORY_LABELS_ID: Record<ExpenseCategory, string> = {
  SUPPLIES: "Perlengkapan",
  UTILITIES: "Utilitas",
  RENT: "Sewa",
  SALARY: "Gaji",
  TRANSPORT: "Transportasi",
  MAINTENANCE: "Pemeliharaan",
  CASH_BOND: "Pinjaman Staf",
  BEVERAGES: "Minuman",
  OTHER: "Lainnya",
};

export type CustomExpenseCategory = { id: string; name: string };

export function customExpenseCategoryKey(id: string): ExpenseCategoryKey {
  return `custom:${id}`;
}

export function customExpenseCategoryId(category: string): string | null {
  return category.startsWith("custom:") && category.length > 7 ? category.slice(7) : null;
}

export function expenseCategoryLabel(category: ExpenseCategoryKey, customCategories: CustomExpenseCategory[] = []): string {
  const customId = customExpenseCategoryId(category);
  return customId
    ? customCategories.find((item) => item.id === customId)?.name ?? "Kategori khusus"
    : CATEGORY_LABELS_ID[category as ExpenseCategory] ?? "Kategori tidak dikenal";
}

export function expenseCategoryColor(category: ExpenseCategoryKey): string {
  return customExpenseCategoryId(category) ? "#475569" : CATEGORY_COLORS[category as ExpenseCategory] ?? "#475569";
}

export function normalizeExpenseCategoryName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("id-ID");
}
