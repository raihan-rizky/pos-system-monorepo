import { MANUAL_INCOME_PAYMENT_LABELS } from "@/features/keuangan/helpers/manual-finance";
import { PRINTING_SUBCATEGORIES } from "@/features/printing-receipts/types";
import { normalizeSubcategoryName } from "@/features/product-classification/helpers/classification";
import type { CatalogGroup } from "@/features/product-classification/types";
import { formatRupiahPrecise } from "@/lib/utils";
import { incomeClassification } from "./income-categories";
import { PAYMENT_METHODS } from "./journal-core";
import type { FinancialReport } from "./report-core";

type CatalogSubcategory = {
  categoryName: string;
  subcategoryName: string;
  legacyName?: string;
};

export type ReportSummaryCatalog = {
  categories: string[];
  subcategories: CatalogSubcategory[];
};

export type FinancialReportResponse = FinancialReport & { summaryCatalog?: ReportSummaryCatalog };

type Amount = readonly [label: string, amount: number];
type CatalogLabel = { name: string; alias?: string };
const categoryNames: Record<CatalogGroup, string> = { ATK: "ATK", PERCETAKAN: "Percetakan" };
const paymentLabels = new Map<string, string>(PAYMENT_METHODS.map(method => [method, MANUAL_INCOME_PAYMENT_LABELS[method]]));

function subcategoryLabel(categoryName: string, subcategoryName: string) {
  return categoryName + " / " + subcategoryName;
}

export function buildReportSummaryCatalog(source: ReadonlyArray<{
  group: CatalogGroup;
  name: string;
  legacyCategory: { name: string } | null;
}>): ReportSummaryCatalog {
  const rows: CatalogSubcategory[] = PRINTING_SUBCATEGORIES.map(printingSubcategory => {
    const { subcategory } = incomeClassification({ transactionCategory: "PERCETAKAN", printingSubcategory, items: [] });
    return { categoryName: categoryNames.PERCETAKAN, subcategoryName: subcategory };
  });
  for (const entry of source) {
    const subcategoryName = entry.name.trim();
    if (!subcategoryName) continue;
    const legacyName = entry.group === "ATK" ? entry.legacyCategory?.name.trim() : undefined;
    rows.push({
      categoryName: categoryNames[entry.group],
      subcategoryName,
      ...(legacyName && legacyName !== subcategoryName ? { legacyName } : {}),
    });
  }

  const uniqueRows = new Map<string, CatalogSubcategory>();
  for (const row of rows) {
    const key = normalizeSubcategoryName(subcategoryLabel(row.categoryName, row.subcategoryName));
    if (!uniqueRows.has(key)) uniqueRows.set(key, row);
  }
  return {
    categories: Object.values(categoryNames),
    subcategories: [...uniqueRows.values()].sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName, "id-ID") || a.subcategoryName.localeCompare(b.subcategoryName, "id-ID")),
  };
}

function amountRows(
  amounts: readonly Amount[],
  formatAmount: (amount: number) => string,
  catalog?: readonly CatalogLabel[],
): [string, string][] {
  if (!catalog) return amounts.map(([label, amount]) => [label, formatAmount(amount)]);

  const rows = new Map<string, { label: string; amount: number }>();
  const aliases = new Map<string, string>();
  for (const { name, alias } of catalog) {
    const key = normalizeSubcategoryName(name);
    rows.set(key, { label: name, amount: 0 });
    if (alias) aliases.set(normalizeSubcategoryName(alias), key);
  }
  for (const [label, amount] of amounts) {
    const normalized = normalizeSubcategoryName(label);
    const key = rows.has(normalized) ? normalized : aliases.get(normalized) ?? normalized;
    const row = rows.get(key);
    if (row) row.amount += amount;
    else rows.set(key, { label, amount });
  }
  return [...rows.values()].map(({ label, amount }) => [label, formatAmount(amount)]);
}

export function buildReportBreakdownTables(
  report: Pick<FinancialReport, "categories" | "subcategories">,
  paymentMethods: ReadonlyArray<{ method: string; amount: number }>,
  catalog?: ReportSummaryCatalog,
  formatAmount: (amount: number) => string = formatRupiahPrecise,
) {
  const paymentAmounts: Amount[] = paymentMethods.map(({ method, amount }) => [
    catalog ? paymentLabels.get(method) ?? method : method === "CASH" ? "Tunai" : method,
    amount,
  ]);

  return [
    {
      title: "Pemasukan per Metode Pembayaran",
      headers: ["Metode pembayaran", "Nominal"],
      rows: amountRows(paymentAmounts, formatAmount, catalog && [...paymentLabels.values()].map(name => ({ name }))),
    },
    {
      title: "Omzet per Kategori",
      headers: ["Kategori", "Nominal"],
      rows: amountRows(
        report.categories.map(({ categoryName, revenue }) => [categoryName, revenue]),
        formatAmount,
        catalog?.categories.map(name => ({ name })),
      ),
    },
    {
      title: "Omzet per Subkategori",
      headers: ["Kategori / Subkategori", "Nominal"],
      rows: amountRows(
        report.subcategories.map(({ categoryName, subcategoryName, revenue }) => [subcategoryLabel(categoryName, subcategoryName), revenue]),
        formatAmount,
        catalog?.subcategories.map(({ categoryName, subcategoryName, legacyName }) => ({
          name: subcategoryLabel(categoryName, subcategoryName),
          ...(legacyName ? { alias: subcategoryLabel(categoryName, legacyName) } : {}),
        })),
      ),
    },
  ];
}
