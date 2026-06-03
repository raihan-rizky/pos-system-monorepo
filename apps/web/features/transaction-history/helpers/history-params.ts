export interface TransactionHistorySearchParamsInput {
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  categoryId?: string;
  status?: string;
  page?: number;
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
  searchParams.set("page", String(params.page || 1));
  searchParams.set("limit", "10");
  return searchParams;
}
