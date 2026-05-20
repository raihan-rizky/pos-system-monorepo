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
};

export type DraftApproveInput = {
  id: string;
  paymentMethod: "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER";
  amountPaid: number;
};

export type DraftTransaction = Transaction;
