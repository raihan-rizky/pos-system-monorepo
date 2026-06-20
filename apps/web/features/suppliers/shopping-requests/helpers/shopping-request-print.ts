import type { ShoppingRequestDetail } from "../types/shopping-request";

export interface ShoppingRequestPrintRow {
  no: number | string;
  productName: string;
  requestedQty: string;
  stockOnHand: string;
  approvedQty: string;
}

/**
 * Build printable rows from a shopping request detail.
 */
export function buildShoppingRequestPrintRows(
  detail: ShoppingRequestDetail,
): ShoppingRequestPrintRow[] {
  const rows: ShoppingRequestPrintRow[] = detail.items.map((item, index) => ({
    no: index + 1,
    productName: item.productName,
    requestedQty: `${item.requestedQty} ${item.unit ?? ""}`.trim(),
    stockOnHand: `${item.stockOnHand} ${item.unit ?? ""}`.trim(),
    approvedQty:
      item.approvedQty !== null
        ? `${item.approvedQty} ${item.unit ?? ""}`.trim()
        : "-",
  }));

  const minRows = 5;
  while (rows.length < minRows) {
    rows.push({
      no: "",
      productName: "",
      requestedQty: "",
      stockOnHand: "",
      approvedQty: "",
    });
  }

  return rows;
}

/**
 * Format an ISO date string to Indonesian long date format.
 */
export function formatShoppingRequestDate(
  value: string | null,
): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
