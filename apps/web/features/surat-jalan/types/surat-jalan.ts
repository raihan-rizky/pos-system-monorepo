export type SuratJalanStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "REJECTED";

export type SuratJalanMarkingStatus =
  | "UNMARKED"
  | "COMPLETED"
  | "NOT_DELIVERED"
  | "NEEDS_SIGNATURE"
  | "NEEDS_FOLLOW_UP"
  | "POSTPONED"
  | "NOT_RELEVANT";

export type SuratJalanProgressStatus =
  | "NONE"
  | "IN_PROGRESS"
  | "PENDING_APPROVAL"
  | "COMPLETE";

export type SuratJalanEligibilityReason =
  | "STATUS_NOT_ELIGIBLE"
  | "PRINTING_SERVICE_NOT_ELIGIBLE"
  | "NO_PRODUCT_LINES"
  | "FULLY_DELIVERED";

export interface SuratJalanTransactionItem {
  id: string;
  productId: string | null;
  printingServiceId: string | null;
  productName: string;
  quantity: number;
  unit: string | null;
  currentStock: number | null;
}

export interface SuratJalanItemRecord {
  id: string;
  transactionItemId: string;
  productId: string;
  productName: string;
  quantity: number;
  unit: string | null;
  keterangan: string;
  stockBefore: number | null;
  stockAfter: number | null;
}

export interface SuratJalanRecord {
  id: string;
  number: string;
  status: SuratJalanStatus;
  recipientName: string;
  sequence: number;
  requestedByName: string | null;
  approvedByName: string | null;
  markingStatus: SuratJalanMarkingStatus;
  markedByName: string | null;
  markedAt: string | null;
  markingNote: string | null;
  createdAt: string;
  confirmedAt: string | null;
  items: SuratJalanItemRecord[];
  transaction?: {
    id: string;
    invoiceNumber: string;
    customerName: string | null;
  };
}

export interface SuratJalanRemainingItem {
  transactionItemId: string;
  productId: string;
  productName: string;
  unit: string | null;
  currentStock: number | null;
  invoiceQuantity: number;
  deliveredQuantity: number;
  pendingQuantity: number;
  remainingQuantity: number;
}

export interface SuratJalanProgress {
  totalQuantity: number;
  deliveredQuantity: number;
  pendingQuantity: number;
  remainingQuantity: number;
  status: SuratJalanProgressStatus;
}

export interface SuratJalanStockImpactPreview {
  transactionItemId: string;
  productId: string;
  productName: string;
  currentStock: number;
  requestedQuantity: number;
  afterStock: number;
  isInsufficientStock: boolean;
}
