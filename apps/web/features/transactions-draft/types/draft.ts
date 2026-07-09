import type { Transaction } from "@/hooks/useTransactions";

export type DraftItemInput = {
  productId: string;
  name: string;
  size?: string | null;
  material?: string | null;
  price: number;
  quantity: number;
};

export type DraftCreateInput = {
  items: DraftItemInput[];
  discount: number;
  note?: string | null;
  customerName?: string | null;
  customerId?: string | null;
  salesName?: string | null;
  salespersonId?: string | null;
  isJobOrder: boolean;
  estimatedDoneAt?: string | null;
  invoiceDate?: string;
  invoiceTime?: string | null;
  invoiceDateReason?: string | null;
  payments?: { method: "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER"; amount: number }[];
};

export type DraftApproveInput = {
  id: string;
  paymentMethod: "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER";
  amountPaid: number;
  invoiceDate?: string;
  invoiceTime?: string | null;
  invoiceDateReason?: string | null;
};

export type DraftTransaction = Transaction;
