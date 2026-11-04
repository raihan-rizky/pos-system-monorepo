export function canVoidTransaction(status: string): boolean {
  return ["DRAFT", "PENDING_APPROVAL", "COMPLETED", "DP"].includes(status);
}

export function isUnconvertedQuotation(transaction: {
  status: string;
  invoiceNumber?: string | null;
  draftNumber?: string | null;
}): boolean {
  if (transaction.invoiceNumber?.trim()) return false;
  return transaction.status === "DRAFT" || Boolean(transaction.draftNumber?.trim());
}
