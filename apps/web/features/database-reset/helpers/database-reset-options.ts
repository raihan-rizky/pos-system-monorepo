import type { DatabaseResetDomain, DatabaseResetModel } from "../types/database-reset";

export const DATABASE_RESET_OPTIONS: Array<{
  id: DatabaseResetDomain;
  label: string;
  description: string;
  items: Array<{ model: DatabaseResetModel; label: string }>;
}> = [
  { id: "productCatalog", label: "Katalog Produk", description: "Pilih data produk atau riwayatnya secara terpisah.", items: [
    { model: "Product", label: "Produk" },
    { model: "Brand", label: "Brand" },
    { model: "ProductStockGroup", label: "Grup Stok" },
    { model: "PrintingService", label: "Layanan Percetakan" },
    { model: "ProductSupplier", label: "Relasi Supplier Produk" },
    { model: "ProductPriceLog", label: "Riwayat Harga" },
    { model: "ProductStockGroupActivity", label: "Riwayat Aktivitas Grup Stok" },
  ] },
  { id: "customers", label: "Pelanggan", description: "Data pelanggan di toko ini.", items: [
    { model: "Customer", label: "Data Pelanggan" },
  ] },
  { id: "salesFinance", label: "Penjualan & Keuangan", description: "Pilih transaksi, pengeluaran, atau riwayat operasional.", items: [
    { model: "Transaction", label: "Transaksi Penjualan" },
    { model: "PrintingReceipt", label: "Nota Percetakan" },
    { model: "CashierShift", label: "Shift Kasir" },
    { model: "Expense", label: "Pengeluaran" },
    { model: "DebtPaymentLog", label: "Riwayat Pembayaran Piutang" },
    { model: "InvoiceDateChangeLog", label: "Riwayat Perubahan Tanggal Faktur" },
    { model: "ProductionActivityLog", label: "Riwayat Aktivitas Produksi" },
  ] },
  { id: "supplierProcurement", label: "Supplier & Pengadaan", description: "Pilih supplier atau dokumen pengadaan.", items: [
    { model: "Supplier", label: "Data Supplier" },
    { model: "ShoppingRequest", label: "Daftar Belanja" },
    { model: "GoodsPurchase", label: "Pembelian Barang" },
    { model: "InventoryInboundReceipt", label: "Penerimaan Barang" },
  ] },
  { id: "inventoryOperations", label: "Inventaris & Operasional", description: "Pilih log stok, surat jalan, atau tugas inventaris.", items: [
    { model: "InventoryLog", label: "Riwayat Pergerakan Stok" },
    { model: "InventoryTask", label: "Tugas Inventaris" },
    { model: "InventoryDaySession", label: "Sesi Inventaris Harian" },
    { model: "InventoryProductionMaterial", label: "Material Produksi" },
    { model: "InventoryTaskChecklistItem", label: "Checklist Tugas" },
    { model: "SuratJalan", label: "Surat Jalan" },
    { model: "InternalStockOutRequest", label: "Permintaan Stok Internal" },
  ] },
  { id: "importBatchJobs", label: "Import & Batch Jobs", description: "Riwayat import dan operasi batch.", items: [
    { model: "BatchOperation", label: "Operasi Batch" },
    { model: "ProductImportJob", label: "Riwayat Import Produk" },
    { model: "BulkStockImportJob", label: "Riwayat Import Stok Massal" },
  ] },
  { id: "storeNotifications", label: "Notifikasi Store", description: "Notifikasi atau langganan push perangkat toko ini.", items: [
    { model: "Notification", label: "Notifikasi Toko" },
    { model: "PushSubscription", label: "Langganan Push Perangkat" },
  ] },
];

export const DATABASE_RESET_SELECTABLE_MODELS = DATABASE_RESET_OPTIONS.flatMap(option => option.items.map(item => item.model));

export const DATABASE_RESET_MODEL_LABELS: Record<DatabaseResetModel, string> = {
  ...Object.fromEntries(DATABASE_RESET_OPTIONS.flatMap(option => option.items.map(item => [item.model, item.label]))),
  TransactionItem: "Item Transaksi", TransactionPayment: "Pembayaran Transaksi",
  TransactionLifecycleAudit: "Audit Perubahan Transaksi",
  ShoppingRequestItem: "Item Daftar Belanja", GoodsPurchaseItem: "Item Pembelian",
  InventoryInboundReceiptLine: "Detail Penerimaan Barang",
  InventoryLogVerification: "Verifikasi Log Stok", InventoryLogCorrectionRequest: "Permintaan Koreksi Stok",
  InventoryLogCorrectionMovement: "Pergerakan Koreksi Stok", SuratJalanItem: "Item Surat Jalan",
  BatchOperationItem: "Detail Operasi Batch", ProductImportJobRow: "Baris Import Produk",
  ProductImportPlannedRow: "Rencana Baris Import",
} as Record<DatabaseResetModel, string>;

export function toggleDatabaseResetCategory(current: readonly DatabaseResetModel[], domain: DatabaseResetDomain): DatabaseResetModel[] {
  const items = DATABASE_RESET_OPTIONS.find(option => option.id === domain)!.items.map(item => item.model);
  return items.every(model => current.includes(model))
    ? current.filter(model => !items.includes(model))
    : [...new Set([...current, ...items])];
}
