import type { Transaction } from "@/hooks/useTransactions";

export const PRINTING_SUBCATEGORIES = ["SPANDUK", "PERCETAKAN", "PLAT", "STEMPEL", "PRINT"] as const;
export type PrintingSubcategory = (typeof PRINTING_SUBCATEGORIES)[number];

export interface PrintingReceiptLine {
  id: string;
  name: string;
  material: string;
  quantity: number | null;
  price: number | null;
  stockLink: { productId: string; quantity: number; unit: string } | null;
}

export interface PrintingReceiptDocument {
  /** Width of each visible table column in millimetres, saved only on this receipt. */
  columnWidths?: number[];
  /** Internal label for the receipt list; never printed on the receipt. */
  title?: string;
  customerName: string;
  customerPhone: string;
  customerId: string | null;
  date: string;
  note: string;
  completionDate: string;
  completionTime: string;
  receiver: string;
  setter: string;
  signatory: string;
  lines: PrintingReceiptLine[];
}

export interface PrintingReceipt {
  id: string;
  storeId: string;
  subcategory: PrintingSubcategory;
  number: string;
  revision: number;
  document: PrintingReceiptDocument;
  transactionId: string | null;
  transaction?: Transaction | null;
  createdAt: string;
  updatedAt: string;
}
