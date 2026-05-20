import type { ExpenseCategory } from "./keuangan-core";

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
