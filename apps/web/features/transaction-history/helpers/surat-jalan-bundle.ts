export interface TransactionSuratJalanSummary {
  count: number;
  confirmedCount: number;
  pendingCount: number;
  deliveredQuantity: number;
  totalQuantity: number;
}

export interface TransactionWithSuratJalanSummary {
  suratJalanSummary?: TransactionSuratJalanSummary | null;
}

export function isSuratJalanBundle(
  transaction: TransactionWithSuratJalanSummary,
): boolean {
  return (transaction.suratJalanSummary?.count ?? 0) > 0;
}

export function formatSuratJalanBundleProgress(
  summary: TransactionSuratJalanSummary | null | undefined,
): string | null {
  if (!summary || summary.count <= 0) return null;

  return `${summary.count} surat jalan • ${summary.deliveredQuantity}/${summary.totalQuantity} item terkirim`;
}
