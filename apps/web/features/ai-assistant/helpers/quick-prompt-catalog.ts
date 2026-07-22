import type { AssistantToolName } from "../services/assistant-tool-registry";
import type { UserRole } from "../types/assistant";

export type AssistantQuickPrompt = {
  label: string;
  toolName: AssistantToolName;
  glow?: boolean;
};

export const OWNER_GLOW_QUICK_PROMPTS = [
  "Rekap finansial bulanan",
  "Rekap pelanggan bulanan",
] as const;

export const ROLE_QUICK_PROMPTS = {
  OWNER: [
    { label: OWNER_GLOW_QUICK_PROMPTS[0], toolName: "exportFinancialReport", glow: true },
    { label: OWNER_GLOW_QUICK_PROMPTS[1], toolName: "exportCustomerRecap", glow: true },
    { label: "Analisis performa finansial 30 hari terakhir", toolName: "analyzeFinancialReport" },
    { label: "Ringkasan penjualan hari ini", toolName: "get_daily_sales_summary" },
    { label: "Daftar produk terlaris hari ini", toolName: "get_top_products" },
    { label: "Cek stok barang menipis", toolName: "get_low_stock_items" },
    { label: "Lihat daftar transaksi pending", toolName: "get_pending_transactions" },
    { label: "Cari supplier Sumber Makmur", toolName: "get_supplier_search" },
    { label: "Cara mengatur hak akses role RBAC", toolName: "get_system_help" },
  ],
  ADMIN: [
    { label: "Buat laporan finansial bulanan PDF", toolName: "exportFinancialReport" },
    { label: "Buat rekap pelanggan bulanan Excel", toolName: "exportCustomerRecap" },
    { label: "Analisis performa finansial 30 hari terakhir", toolName: "analyzeFinancialReport" },
    { label: "Tambah produk baru", toolName: "openProductModal" },
    { label: "Tambah supplier baru", toolName: "openSupplierModal" },
    { label: "Tambah sales baru", toolName: "openSalespersonModal" },
    { label: "Catat pengeluaran operasional", toolName: "openExpenseModal" },
    { label: "Lihat daftar transaksi pending", toolName: "get_pending_transactions" },
    { label: "Cara mengatur hak akses role RBAC", toolName: "get_system_help" },
  ],
  INVENTORY: [
    { label: "Cek stok barang menipis", toolName: "get_low_stock_items" },
    { label: "Berapa stok Kertas HVS?", toolName: "get_product_stock" },
    { label: "Berapa harga Kertas HVS?", toolName: "get_product_price" },
    { label: "Update stok satu produk", toolName: "openStockUpdateModal" },
    { label: "Input penerimaan barang", toolName: "openInboundReceiptModal" },
    { label: "Bagaimana cara melakukan stock opname?", toolName: "get_system_help" },
  ],
  CASHIER: [
    { label: "Cek stok Kertas HVS", toolName: "get_product_stock" },
    { label: "Berapa harga Kertas HVS?", toolName: "get_product_price" },
    { label: "Lihat daftar transaksi pending", toolName: "get_pending_transactions" },
    { label: "Tambah pelanggan baru", toolName: "openCustomerModal" },
    { label: "Catat pengeluaran operasional", toolName: "openExpenseModal" },
    { label: "Mulai shift kasir", toolName: "openShiftModal" },
    { label: "Cara membuat transaksi baru", toolName: "get_system_help" },
  ],
  SALES: [
    { label: "Cari pelanggan Toko Makmur", toolName: "get_customer_search" },
    { label: "Cek sisa piutang Agen Sabar Subur", toolName: "get_customer_debt_summary" },
    { label: "Rekap transaksi pelanggan Budi", toolName: "get_customer_recap_summary" },
    { label: "Buat rekap pelanggan 30 hari dalam Excel", toolName: "exportCustomerRecap" },
    { label: "Tambah pelanggan baru", toolName: "openCustomerModal" },
    { label: "Bagaimana cara mencatat transaksi?", toolName: "get_system_help" },
  ],
} as const satisfies Record<UserRole, readonly AssistantQuickPrompt[]>;

const FALLBACK_QUICK_PROMPTS = [
  "Cara menggunakan asisten Pak Teladan",
  "Panduan penggunaan sistem POS",
] as const;

export function getQuickPromptEntriesForRole(role: string | null | undefined) {
  const normalizedRole = role?.toUpperCase() as UserRole | undefined;
  return normalizedRole && normalizedRole in ROLE_QUICK_PROMPTS
    ? ROLE_QUICK_PROMPTS[normalizedRole]
    : null;
}

export function getQuickPromptsForRole(role: string | null | undefined): readonly string[] {
  return getQuickPromptEntriesForRole(role)?.map((prompt) => prompt.label)
    ?? FALLBACK_QUICK_PROMPTS;
}

export function isGlowingQuickPrompt(label: string) {
  return OWNER_GLOW_QUICK_PROMPTS.some((prompt) => prompt === label);
}
