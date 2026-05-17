export type BulkStockType = "IN" | "OUT" | "ADJUSTMENT";

export interface BulkStockItem {
  productId: string;
  productName: string;
  currentStock: number;
  quantity: number;
  unit: string;
}

export interface BulkStockPreviewRow {
  productId: string;
  name: string;
  currentStock: number;
  delta: number;
  newStock: number;
  unit: string;
  error?: string;
}

export interface BulkStockCommitResult {
  updatedCount: number;
  inventoryLogCount: number;
  batchOperationId: string;
  undoAvailable: boolean;
}
