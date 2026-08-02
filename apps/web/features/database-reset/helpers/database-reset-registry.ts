import type {
  DatabaseResetDomain,
  DatabaseResetModel,
  DatabaseResetWhere,
} from "../types/database-reset";

export interface DatabaseResetModelDefinition {
  model: DatabaseResetModel;
  delegate: string;
  priority: number;
  where: (storeId: string) => DatabaseResetWhere;
}

export interface DatabaseResetDomainModel {
  model: DatabaseResetModel;
  mode: "selected" | "cascade";
  reason: string;
}

export interface RequiredDependencyDefinition {
  source: DatabaseResetDomain;
  target: DatabaseResetDomain;
  model: DatabaseResetModel;
  reason: string;
  where?: (storeId: string) => DatabaseResetWhere;
}

const storeWhere = (storeId: string) => ({ storeId });
const productWhere = (storeId: string) => ({ product: { storeId } });
const transactionWhere = (storeId: string) => ({ transaction: { storeId } });
const shoppingRequestWhere = (storeId: string) => ({ shoppingRequest: { storeId } });
const goodsPurchaseWhere = (storeId: string) => ({ goodsPurchase: { storeId } });
const receiptWhere = (storeId: string) => ({ receipt: { storeId } });
const suratJalanWhere = (storeId: string) => ({ suratJalan: { storeId } });
const correctionRequestWhere = (storeId: string) => ({ correctionRequest: { storeId } });
const batchOperationWhere = (storeId: string) => ({ batchOperation: { storeId } });
const importJobWhere = (storeId: string) => ({ job: { storeId } });

export const DATABASE_RESET_MODELS: Record<DatabaseResetModel, DatabaseResetModelDefinition> = {
  Product: { model: "Product", delegate: "product", priority: 100, where: storeWhere },
  Brand: { model: "Brand", delegate: "brand", priority: 100, where: storeWhere },
  ProductStockGroup: { model: "ProductStockGroup", delegate: "productStockGroup", priority: 100, where: storeWhere },
  PrintingService: { model: "PrintingService", delegate: "printingService", priority: 100, where: storeWhere },
  ProductSupplier: { model: "ProductSupplier", delegate: "productSupplier", priority: 20, where: productWhere },
  ProductPriceLog: { model: "ProductPriceLog", delegate: "productPriceLog", priority: 20, where: storeWhere },
  ProductStockGroupActivity: { model: "ProductStockGroupActivity", delegate: "productStockGroupActivity", priority: 10, where: (storeId) => ({ stockGroup: { storeId } }) },
  Customer: { model: "Customer", delegate: "customer", priority: 100, where: storeWhere },
  Transaction: { model: "Transaction", delegate: "transaction", priority: 100, where: storeWhere },
  TransactionItem: { model: "TransactionItem", delegate: "transactionItem", priority: 10, where: transactionWhere },
  TransactionPayment: { model: "TransactionPayment", delegate: "transactionPayment", priority: 10, where: transactionWhere },
  DebtPaymentLog: { model: "DebtPaymentLog", delegate: "debtPaymentLog", priority: 10, where: storeWhere },
  CashierShift: { model: "CashierShift", delegate: "cashierShift", priority: 80, where: storeWhere },
  Expense: { model: "Expense", delegate: "expense", priority: 30, where: storeWhere },
  InvoiceDateChangeLog: { model: "InvoiceDateChangeLog", delegate: "invoiceDateChangeLog", priority: 20, where: storeWhere },
  ProductionActivityLog: { model: "ProductionActivityLog", delegate: "productionActivityLog", priority: 20, where: storeWhere },
  Supplier: { model: "Supplier", delegate: "supplier", priority: 100, where: storeWhere },
  ShoppingRequest: { model: "ShoppingRequest", delegate: "shoppingRequest", priority: 100, where: storeWhere },
  ShoppingRequestItem: { model: "ShoppingRequestItem", delegate: "shoppingRequestItem", priority: 10, where: shoppingRequestWhere },
  GoodsPurchase: { model: "GoodsPurchase", delegate: "goodsPurchase", priority: 100, where: storeWhere },
  GoodsPurchaseItem: { model: "GoodsPurchaseItem", delegate: "goodsPurchaseItem", priority: 10, where: goodsPurchaseWhere },
  InventoryInboundReceipt: { model: "InventoryInboundReceipt", delegate: "inventoryInboundReceipt", priority: 100, where: storeWhere },
  InventoryInboundReceiptLine: { model: "InventoryInboundReceiptLine", delegate: "inventoryInboundReceiptLine", priority: 10, where: receiptWhere },
  InventoryLog: { model: "InventoryLog", delegate: "inventoryLog", priority: 40, where: productWhere },
  InventoryLogVerification: { model: "InventoryLogVerification", delegate: "inventoryLogVerification", priority: 10, where: storeWhere },
  InventoryLogCorrectionRequest: { model: "InventoryLogCorrectionRequest", delegate: "inventoryLogCorrectionRequest", priority: 20, where: storeWhere },
  InventoryLogCorrectionMovement: { model: "InventoryLogCorrectionMovement", delegate: "inventoryLogCorrectionMovement", priority: 10, where: correctionRequestWhere },
  InventoryTask: { model: "InventoryTask", delegate: "inventoryTask", priority: 100, where: storeWhere },
  InventoryDaySession: { model: "InventoryDaySession", delegate: "inventoryDaySession", priority: 100, where: storeWhere },
  InventoryProductionMaterial: { model: "InventoryProductionMaterial", delegate: "inventoryProductionMaterial", priority: 20, where: storeWhere },
  InventoryTaskChecklistItem: { model: "InventoryTaskChecklistItem", delegate: "inventoryTaskChecklistItem", priority: 10, where: storeWhere },
  SuratJalan: { model: "SuratJalan", delegate: "suratJalan", priority: 100, where: storeWhere },
  SuratJalanItem: { model: "SuratJalanItem", delegate: "suratJalanItem", priority: 10, where: suratJalanWhere },
  InternalStockOutRequest: { model: "InternalStockOutRequest", delegate: "internalStockOutRequest", priority: 100, where: storeWhere },
  BatchOperation: { model: "BatchOperation", delegate: "batchOperation", priority: 100, where: storeWhere },
  BatchOperationItem: { model: "BatchOperationItem", delegate: "batchOperationItem", priority: 10, where: batchOperationWhere },
  ProductImportJob: { model: "ProductImportJob", delegate: "productImportJob", priority: 100, where: storeWhere },
  ProductImportJobRow: { model: "ProductImportJobRow", delegate: "productImportJobRow", priority: 10, where: importJobWhere },
  ProductImportPlannedRow: { model: "ProductImportPlannedRow", delegate: "productImportPlannedRow", priority: 10, where: batchOperationWhere },
  BulkStockImportJob: { model: "BulkStockImportJob", delegate: "bulkStockImportJob", priority: 100, where: storeWhere },
  Notification: { model: "Notification", delegate: "notification", priority: 10, where: storeWhere },
  PushSubscription: { model: "PushSubscription", delegate: "pushSubscription", priority: 10, where: storeWhere },
};

const selected = (model: DatabaseResetModel, reason: string): DatabaseResetDomainModel => ({ model, mode: "selected", reason });
const cascade = (model: DatabaseResetModel, reason: string): DatabaseResetDomainModel => ({ model, mode: "cascade", reason });

export const DATABASE_RESET_DOMAINS: Record<DatabaseResetDomain, DatabaseResetDomainModel[]> = {
  productCatalog: [
    selected("Product", "Produk katalog toko"),
    selected("Brand", "Brand katalog toko"),
    selected("ProductStockGroup", "Grup stok produk"),
    selected("PrintingService", "Layanan percetakan"),
    cascade("ProductSupplier", "Link supplier produk ikut terhapus bersama katalog"),
    cascade("ProductPriceLog", "Riwayat harga produk ikut terhapus bersama katalog"),
    cascade("ProductStockGroupActivity", "Aktivitas grup stok ikut terhapus bersama katalog"),
  ],
  customers: [selected("Customer", "Data pelanggan toko")],
  salesFinance: [
    selected("Transaction", "Transaksi penjualan toko"),
    cascade("TransactionItem", "Item transaksi ikut terhapus bersama transaksi"),
    cascade("TransactionPayment", "Pembayaran transaksi ikut terhapus bersama transaksi"),
    cascade("DebtPaymentLog", "Riwayat pembayaran piutang ikut terhapus"),
    selected("CashierShift", "Shift kasir toko"),
    selected("Expense", "Pengeluaran toko"),
    cascade("InvoiceDateChangeLog", "Riwayat perubahan invoice ikut terhapus"),
    cascade("ProductionActivityLog", "Aktivitas produksi ikut terhapus"),
  ],
  supplierProcurement: [
    selected("Supplier", "Data supplier toko"),
    selected("ShoppingRequest", "Daftar belanja toko"),
    cascade("ShoppingRequestItem", "Item daftar belanja ikut terhapus"),
    selected("GoodsPurchase", "Pembelian barang toko"),
    cascade("GoodsPurchaseItem", "Item pembelian ikut terhapus"),
    selected("InventoryInboundReceipt", "Penerimaan barang toko"),
    cascade("InventoryInboundReceiptLine", "Detail penerimaan ikut terhapus"),
    cascade("ProductSupplier", "Link supplier produk ikut terhapus bersama supplier"),
  ],
  inventoryOperations: [
    selected("InventoryLog", "Riwayat pergerakan stok"),
    cascade("InventoryLogVerification", "Verifikasi log stok ikut terhapus"),
    cascade("InventoryLogCorrectionRequest", "Permintaan koreksi stok ikut terhapus"),
    cascade("InventoryLogCorrectionMovement", "Pergerakan koreksi stok ikut terhapus"),
    selected("InventoryTask", "Tugas inventaris"),
    selected("InventoryDaySession", "Sesi inventaris harian"),
    cascade("InventoryProductionMaterial", "Material produksi ikut terhapus"),
    cascade("InventoryTaskChecklistItem", "Checklist tugas ikut terhapus"),
    selected("SuratJalan", "Surat jalan toko"),
    cascade("SuratJalanItem", "Item surat jalan ikut terhapus"),
    selected("InternalStockOutRequest", "Permintaan stok internal"),
  ],
  importBatchJobs: [
    selected("BatchOperation", "Operasi batch toko"),
    cascade("BatchOperationItem", "Detail operasi batch ikut terhapus"),
    selected("ProductImportJob", "Job import produk"),
    cascade("ProductImportJobRow", "Baris import produk ikut terhapus"),
    cascade("ProductImportPlannedRow", "Rencana baris import ikut terhapus"),
    selected("BulkStockImportJob", "Job import stok massal"),
  ],
  storeNotifications: [
    selected("Notification", "Notifikasi toko"),
    selected("PushSubscription", "Langganan push perangkat toko"),
  ],
};

export const REQUIRED_DEPENDENCIES: RequiredDependencyDefinition[] = [
  { source: "productCatalog", target: "salesFinance", model: "TransactionItem", reason: "Item transaksi masih mereferensikan produk yang dipilih.", where: transactionWhere },
  { source: "productCatalog", target: "supplierProcurement", model: "GoodsPurchaseItem", reason: "Item pembelian masih mereferensikan produk yang dipilih.", where: goodsPurchaseWhere },
  { source: "productCatalog", target: "supplierProcurement", model: "ShoppingRequestItem", reason: "Item daftar belanja masih mereferensikan produk yang dipilih.", where: shoppingRequestWhere },
  { source: "productCatalog", target: "supplierProcurement", model: "InventoryInboundReceiptLine", reason: "Detail penerimaan masih mereferensikan produk yang dipilih.", where: receiptWhere },
  { source: "productCatalog", target: "inventoryOperations", model: "SuratJalanItem", reason: "Item surat jalan masih mereferensikan produk yang dipilih.", where: suratJalanWhere },
  { source: "productCatalog", target: "inventoryOperations", model: "InventoryLog", reason: "Riwayat stok masih mereferensikan produk yang dipilih.", where: productWhere },
  { source: "productCatalog", target: "importBatchJobs", model: "BatchOperationItem", reason: "Operasi batch masih mereferensikan produk yang dipilih.", where: batchOperationWhere },
  { source: "customers", target: "salesFinance", model: "Transaction", reason: "Transaksi masih mereferensikan pelanggan yang dipilih.", where: (storeId) => ({ storeId, customerId: { not: null } }) },
  { source: "salesFinance", target: "inventoryOperations", model: "InventoryLog", reason: "Riwayat stok masih terhubung ke transaksi yang dipilih.", where: transactionWhere },
  { source: "salesFinance", target: "inventoryOperations", model: "SuratJalanItem", reason: "Item surat jalan masih terhubung ke item transaksi yang dipilih.", where: suratJalanWhere },
  { source: "supplierProcurement", target: "salesFinance", model: "Expense", reason: "Pengeluaran masih terhubung ke pengadaan yang dipilih.", where: storeWhere },
  { source: "supplierProcurement", target: "inventoryOperations", model: "InventoryLog", reason: "Riwayat stok masih terhubung ke supplier yang dipilih.", where: productWhere },
];

export const PRESERVED_DATABASE_RESET_DATA = [
  { model: "Category", reason: "Kategori bersifat global dan dapat dipakai lintas store." },
  { model: "User", reason: "Akun login dan owner harus tetap tersedia." },
  { model: "StoreSettings", reason: "Informasi toko tidak termasuk data operasional reset." },
  { model: "RolePermission", reason: "Konfigurasi RBAC harus tetap aman." },
  { model: "Assistant chat/vector/legacy tables", reason: "Data ini shared dan tidak memiliki current-store ownership." },
] as const;
