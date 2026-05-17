export interface BatchOperationSummaryItem {
  label: string;
  value: number;
}

export interface UndoResult {
  restoredCount: number;
  skippedCount: number;
  blockedProducts?: Array<{
    productId: string;
    reason: string;
  }>;
}
