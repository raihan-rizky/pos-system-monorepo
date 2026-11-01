export const TRANSACTION_HISTORY_PAYMENT_METHODS = [
  "CASH",
  "DEBIT",
  "CREDIT",
  "QRIS",
  "TRANSFER",
  "TEMPO",
] as const;

export type TransactionHistoryPaymentMethod =
  (typeof TRANSACTION_HISTORY_PAYMENT_METHODS)[number];

export interface TransactionHistorySearchParamsInput {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  transactionCategory?: "ATK" | "PERCETAKAN";
  printingSubcategory?: string;
  status?: string;
  paymentMethod?: TransactionHistoryPaymentMethod;
  suratJalan?: "bundled";
  page?: number;
  customerType?: string;
}

export function buildTransactionHistorySearchParams(
  params: TransactionHistorySearchParamsInput,
) {
  const searchParams = new URLSearchParams();
  if (params.search) searchParams.set("search", params.search);
  if (params.dateFrom) searchParams.set("dateFrom", params.dateFrom);
  if (params.dateTo) searchParams.set("dateTo", params.dateTo);
  if (params.transactionCategory) searchParams.set("transactionCategory", params.transactionCategory);
  if (params.transactionCategory === "ATK" && params.categoryId) {
    searchParams.set("categoryId", params.categoryId);
  }
  if (params.transactionCategory === "PERCETAKAN" && params.printingSubcategory) {
    searchParams.set("printingSubcategory", params.printingSubcategory);
  }
  if (params.status) searchParams.set("status", params.status);
  if (params.paymentMethod) searchParams.set("paymentMethod", params.paymentMethod);
  if (params.suratJalan) searchParams.set("suratJalan", params.suratJalan);
  if (params.customerType) searchParams.set("customerType", params.customerType);
  searchParams.set("page", String(params.page || 1));
  searchParams.set("limit", "10");
  return searchParams;
}
