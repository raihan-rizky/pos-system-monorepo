export interface TransactionHistorySearchParamsInput {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  status?: string;
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
  if (params.categoryId) searchParams.set("categoryId", params.categoryId);
  if (params.status) searchParams.set("status", params.status);
  if (params.suratJalan) searchParams.set("suratJalan", params.suratJalan);
  if (params.customerType) searchParams.set("customerType", params.customerType);
  searchParams.set("page", String(params.page || 1));
  searchParams.set("limit", "10");
  return searchParams;
}
