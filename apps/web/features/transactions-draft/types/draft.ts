import type { Transaction } from "@/hooks/useTransactions";
import type { PricingPreference } from "@/features/customer-category-pricing/helpers/pricing-rules";

export type DraftItemInput = {
  productId: string;
  name: string;
  documentName?: string | null;
  size?: string | null;
  material?: string | null;
  price: number;
  transactionPrice?: number | null;
  discount?: number;
  quantity: number;
};

export type DraftCreateInput = {
  draftNumber?: string | null;
  items: DraftItemInput[];
  discount: number;
  note?: string | null;
  customerName?: string | null;
  customerId?: string | null;
  salesName?: string | null;
  salespersonId?: string | null;
  isJobOrder: boolean;
  estimatedDoneAt?: string | null;
  pricingPreference?: PricingPreference;
  invoiceDate?: string;
  invoiceTime?: string | null;
  invoiceDateReason?: string | null;
  payments?: { method: "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER"; amount: number }[];
};

export type DraftApproveInput = {
  id: string;
  paymentMethod: "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER" | "TEMPO";
  amountPaid: number;
  payments?: { method: "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER"; amount: number }[];
  items?: {
    productId?: string | null;
    printingServiceId?: string | null;
    quantity: number;
    rawMaterialProductId?: string | null;
    rawMaterialQuantity?: number | null;
    size?: string | null;
    material?: string | null;
  }[];
  quoteFingerprint?: string;
  invoiceDate?: string;
  invoiceTime?: string | null;
  invoiceDateReason?: string | null;
};

export type DraftTransaction = Transaction;
