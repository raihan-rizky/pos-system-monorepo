type InvoiceDateChangeLike = {
  oldInvoiceDate?: string | null;
} | null;

type TransactionInvoiceDateLike = {
  invoiceDate?: string | null;
  createdAt: string;
  latestInvoiceDateChange?: InvoiceDateChangeLike;
};

export function getTransactionInvoiceDate(
  transaction: Pick<TransactionInvoiceDateLike, "invoiceDate" | "createdAt">,
): string {
  return transaction.invoiceDate || transaction.createdAt;
}

export function getLatestPreviousInvoiceDate(
  transaction: Pick<TransactionInvoiceDateLike, "latestInvoiceDateChange">,
): string | null {
  return transaction.latestInvoiceDateChange?.oldInvoiceDate || null;
}

export function hasInvoiceDateChange(
  transaction: Pick<TransactionInvoiceDateLike, "latestInvoiceDateChange">,
): boolean {
  return Boolean(getLatestPreviousInvoiceDate(transaction));
}
