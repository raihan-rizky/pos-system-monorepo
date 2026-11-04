import type {
  ReceiptChangeItem,
  ReceiptChangeRecord,
  ReceiptChangeSnapshot,
} from "../types";

export const receiptItem: ReceiptChangeItem = {
  productId: "banner-1",
  productName: "Cetak banner",
  documentName: null,
  quantity: 2,
  unit: "meter",
  unitPrice: 20000,
  appliedUnitPrice: 20000,
  originalUnitPrice: null,
  discount: 0,
  subtotal: 40000,
  material: "Flexi",
  size: "1 × 2 m",
  serviceNote: null,
  rawMaterialProductId: null,
  rawMaterialQuantity: null,
  rawMaterialUnit: null,
};

export const receiptSnapshot: ReceiptChangeSnapshot = {
  invoiceNumber: "INV-DEMO-0042",
  invoiceDate: "2026-11-05T02:45:00Z",
  customerId: "customer-demo",
  customerName: "Pelanggan contoh",
  salespersonId: "sales-demo",
  salesName: "Sales demo",
  note: "Ambil di toko",
  status: "COMPLETED",
  paymentMethod: "CASH",
  subtotal: 40000,
  discount: 0,
  tax: 0,
  taxRate: null,
  taxMethod: "EXCLUSIVE",
  total: 40000,
  amountPaid: 40000,
  change: 0,
  payments: [{ method: "CASH", amount: 40000 }],
  debtPayments: [],
  items: [receiptItem],
  printingReceipt: null,
};

export const receiptChanges: ReceiptChangeRecord[] = [
  {
    id: "revision-1",
    actorName: "Sales demo",
    createdAt: "2026-11-05T03:14:00Z",
    before: receiptSnapshot,
    after: { ...receiptSnapshot, note: "Ambil pukul 16.00" },
  },
  {
    id: "revision-2",
    actorName: "Sales demo",
    createdAt: "2026-11-05T04:02:00Z",
    before: { ...receiptSnapshot, note: "Ambil pukul 16.00" },
    after: {
      ...receiptSnapshot,
      note: "Ambil pukul 16.00",
      subtotal: 60000,
      total: 60000,
      amountPaid: 60000,
      payments: [{ method: "CASH", amount: 60000 }],
      items: [{ ...receiptItem, quantity: 3, subtotal: 60000 }],
    },
  },
];
