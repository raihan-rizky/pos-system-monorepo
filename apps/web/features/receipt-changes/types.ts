import type { Prisma } from "@pos/db";

export type ReceiptChangeItem = {
  productId: string | null;
  productName: string;
  documentName: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  appliedUnitPrice: number;
  originalUnitPrice: number | null;
  discount: number;
  subtotal: number;
  material: string | null;
  size: string | null;
  serviceNote: string | null;
  rawMaterialProductId: string | null;
  rawMaterialQuantity: number | null;
  rawMaterialUnit: string | null;
};

export type ReceiptChangeSnapshot = {
  invoiceNumber: string | null;
  invoiceDate: string;
  customerId: string | null;
  customerName: string | null;
  salespersonId: string | null;
  salesName: string | null;
  note: string | null;
  status: string;
  paymentMethod: string;
  subtotal: number;
  discount: number;
  tax: number;
  taxRate: number | null;
  taxMethod: string;
  total: number;
  amountPaid: number;
  change: number;
  payments: Array<{ method: string; amount: number }>;
  debtPayments: Array<{ method: string; amount: number }>;
  items: ReceiptChangeItem[];
  printingReceipt: {
    number: string;
    subcategory: string;
    document: Prisma.JsonValue;
  } | null;
};

export type ReceiptChangeRecord = {
  id: string;
  actorName: string;
  createdAt: string;
  before: ReceiptChangeSnapshot;
  after: ReceiptChangeSnapshot;
};
