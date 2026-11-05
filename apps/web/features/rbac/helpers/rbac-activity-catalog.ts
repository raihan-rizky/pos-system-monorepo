import { canRolePerformAction, OWNER_LOCKED_RESOURCE_TARGETS } from "./rbac-core";
import type { EditableRole, ResourceAction, RolePermissions } from "./rbac-core";

export type ResourceEditorMetadata = {
  label: string;
  actions: ResourceAction[];
  actionLabels?: Partial<Record<ResourceAction, string>>;
  guidance?: string;
  ownerOnlyReason?: string;
};

// Checked against server requirePermission/canRolePerformAction and UI canPerform usages.
// Unused stored grants stay intact; the editor only offers actions used by the application.
export const RBAC_RESOURCE_METADATA: Record<string, ResourceEditorMetadata> = {
  "transaction.custom_price": { label: "Harga khusus di nota", actions: ["update"], actionLabels: { update: "Ubah harga di nota" }, guidance: "Memerlukan akses Kasir dan izin transaksi sesuai alurnya. Hanya mengubah harga pada nota, bukan harga master produk." },
  "income.manual": { label: "Pemasukan manual", actions: ["create", "read", "update", "delete"], guidance: "Memerlukan akses Laporan Keuangan. Mengatur pencatatan pemasukan manual; pemasukan otomatis dari transaksi tetap mengikuti alurnya." },
  "expense.manual_transfer": { label: "Pengeluaran dan transfer manual", actions: ["create", "update", "delete"], guidance: "Memerlukan akses Keuangan Harian dan Lihat pengeluaran. Mengatur pengeluaran serta transfer kas manual." },
  "expense.payable": { label: "Pembayaran utang supplier", actions: ["create", "read", "update"], actionLabels: { create: "Bayar utang", read: "Lihat utang", update: "Ubah pembayaran" }, guidance: "Memerlukan akses Keuangan Harian dan Lihat pengeluaran. Mengatur daftar utang dan pembayaran utang supplier." },
  "expense.giro": { label: "Pencairan giro", actions: ["read", "update"], actionLabels: { read: "Lihat giro", update: "Cairkan giro" }, guidance: "Memerlukan akses Keuangan Harian dan Lihat pengeluaran untuk melihat serta mencairkan giro." },
  "financial-report.export": { label: "Ekspor laporan keuangan", actions: ["read"], actionLabels: { read: "Ekspor laporan" }, guidance: "Memerlukan akses Laporan Keuangan dan Lihat laporan keuangan untuk mengunduh laporan." },
  "product.import": { label: "Impor produk", actions: ["create", "read", "update"], actionLabels: { create: "Mulai impor", read: "Lihat progres impor", update: "Perbarui impor" }, guidance: "Memerlukan akses Produk dan izin produk sesuai tindakan. Lihat hanya memantau progres; Buat diperlukan untuk memulai job impor." },
  "inventory.bulk": { label: "Perubahan stok massal", actions: ["read", "update"], actionLabels: { read: "Lihat progres stok massal", update: "Mulai perubahan stok massal" }, guidance: "Memerlukan akses Inventory dan Lihat data gudang. Lihat hanya memantau progres; Ubah diperlukan untuk memulai job stok massal." },
  transaction: { label: "Transaksi", actions: ["create", "read", "update", "delete"], guidance: "Lihat dan Ubah juga dipakai di Riwayat. Ubah transaksi mencakup Void; Hapus transaksi memerlukan izin Hapus. Akses halaman Riwayat diatur di modul Approval Transaksi." },
  "transaction.request": { label: "Permintaan transaksi Sales", actions: ["create", "read", "update"], guidance: "Dipakai untuk nota dan permintaan transaksi milik Sales." },
  "transaction.draft": { label: "Draft transaksi", actions: ["create", "read", "update", "delete"], actionLabels: { update: "Ubah / setujui draft", delete: "Batalkan draft" } },
  "transaction.auto_approve": { label: "Auto Approve Transaksi", actions: ["create"], actionLabels: { create: "Finalisasi otomatis" }, guidance: "Aktifkan aksi Buat agar transaksi role ini langsung final tanpa menunggu approval." },
  "transaction.approve": { label: "Persetujuan transaksi", actions: ["update", "delete"], actionLabels: { update: "Setujui transaksi", delete: "Tolak / batalkan transaksi" }, guidance: "Memerlukan akses Riwayat dan Lihat transaksi. Izin Lihat pada resource approval tidak dipakai untuk memuat data Riwayat." },
  "printing_receipt.processed": { label: "Nota percetakan diproses", actions: ["update"], actionLabels: { update: "Ubah nota diproses" }, guidance: "Memerlukan akses nota dan izin Ubah transaksi; perubahan dapat menyesuaikan stok, keuangan, dan piutang." },
  "financial-report": { label: "Laporan keuangan", actions: ["read"] },
  "financial-report.daily-income": { label: "Total pemasukan harian", actions: ["read"], guidance: "Memerlukan akses halaman Laporan Keuangan. Menampilkan uang diterima pada satu tanggal WIB." },
  "financial-report.daily-category": { label: "Pemasukan kategori harian", actions: ["read"], guidance: "Rincian ATK dan Percetakan pada satu tanggal, tanpa data laba atau HPP." },
  "financial-report.daily-subcategory": { label: "Pemasukan subkategori harian", actions: ["read"], guidance: "Rincian kategori produk ATK dan jenis layanan Percetakan pada satu tanggal." },
  "financial-report.daily-payment-method": { label: "Pemasukan metode pembayaran harian", actions: ["read"], guidance: "Uang diterima per metode pembayaran, termasuk DP dan pelunasan pada tanggal pilihan." },
  income: { label: "Pemasukan", actions: ["create", "read", "update", "delete"] },
  production: { label: "Pekerjaan produksi", actions: ["read", "update"] },
  customer: { label: "Data pelanggan", actions: ["create", "read", "update", "delete"] },
  product: { label: "Produk dan kategori", actions: ["create", "read", "update", "delete"] },
  "product.price_log": { label: "Riwayat harga dan HPP", actions: ["read"], guidance: "Buka halaman Produk dan aktifkan Lihat produk untuk menemukan riwayat harga." },
  supplier: { label: "Data supplier", actions: ["create", "read", "update"] },
  "supplier.shopping_request.edit": { label: "Edit permintaan belanja", actions: ["update"], actionLabels: { update: "Edit permintaan" } },
  "supplier.shopping_request.delete": { label: "Hapus daftar belanja", actions: ["delete"], actionLabels: { delete: "Hapus daftar" }, guidance: "Dapat membatalkan daftar dan membalikkan stok penerimaan terkait." },
  "supplier.shopping_request.set_approved_qty": { label: "Jumlah belanja disetujui", actions: ["update"], actionLabels: { update: "Isi jumlah disetujui" } },
  "supplier.shopping_request.approve_stock": { label: "Persetujuan stok belanja", actions: ["update"], actionLabels: { update: "Setujui stok" } },
  "supplier.goods_purchase.approve": { label: "Persetujuan pembelian", actions: ["update"], actionLabels: { update: "Setujui pembelian" } },
  "supplier.goods_purchase.reject": { label: "Penolakan pembelian", actions: ["update"], actionLabels: { update: "Tolak pembelian" } },
  salesperson: { label: "Data salesperson", actions: ["create", "read", "update", "delete"] },
  shift: { label: "Shift kasir", actions: ["create", "read", "update"] },
  whatsapp: { label: "Pesan dan pengaturan WhatsApp", actions: ["create", "read", "update"] },
  settings: { label: "Pengaturan toko", actions: ["read", "update"] },
  rbac: { label: "Pengelolaan hak akses", actions: [], ownerOnlyReason: "Pengelolaan hak akses selalu dibatasi untuk Owner oleh kebijakan server." },
  "settings.price_rounding": { label: "Pembulatan harga", actions: ["read", "update"], guidance: "Memerlukan akses halaman Pengaturan. Izin Lihat atau Ubah menampilkan tab Pembulatan Harga." },
  expense: { label: "Pengeluaran dan kas", actions: ["create", "read", "update", "delete"] },
  proof_upload: { label: "Bukti tersimpan", actions: ["delete"], actionLabels: { delete: "Hapus bukti" }, guidance: "Penghapusan dilakukan dari fitur asal bukti; akses halaman dan data fitur tersebut tetap diperlukan." },
  inventory: { label: "Data dan aktivitas gudang", actions: ["read", "update", "delete"] },
  "inventory.approve": { label: "Persetujuan perubahan stok", actions: [], ownerOnlyReason: "Persetujuan perubahan stok ini selalu dibatasi untuk Owner oleh kebijakan server." },
  "inventory.out_log.verify": { label: "Verifikasi stok keluar", actions: ["update"], actionLabels: { update: "Verifikasi OUT log" }, guidance: "Memerlukan akses halaman Inventory dan Lihat data gudang." },
  "inventory.inbound_receipt.create": { label: "Penerimaan barang", actions: ["create"], actionLabels: { create: "Catat penerimaan" }, guidance: "Memerlukan akses halaman Inventory dan Lihat data gudang. Pengiriman penerimaan memakai Ubah data gudang." },
  "inventory.inbound_receipt.approve": { label: "Persetujuan penerimaan", actions: ["update"], actionLabels: { update: "Setujui penerimaan" } },
  "inventory.inbound_receipt.reject": { label: "Penolakan penerimaan", actions: ["update"], actionLabels: { update: "Tolak penerimaan" } },
  "inventory.inbound_receipt.edit": { label: "Revisi penerimaan", actions: ["update"], actionLabels: { update: "Revisi penerimaan" } },
  surat_jalan: { label: "Dokumen Surat Jalan", actions: ["create", "read", "update"], actionLabels: { update: "Ubah dokumen dan approval" }, guidance: "Buat mengizinkan pengiriman baru; Ubah mengizinkan edit penerima, nama barang, jumlah dan keterangan dokumen tersimpan serta approval. Surat Jalan dibuka dari transaksi di Riwayat; akses Riwayat dan Lihat transaksi tetap diperlukan." },
  "surat_jalan.auto_approve": { label: "Auto Approve Surat Jalan", actions: ["create"], actionLabels: { create: "Konfirmasi otomatis" }, guidance: "Aktifkan aksi Buat agar Surat Jalan role ini langsung dikonfirmasi tanpa menunggu approval." },
};

export type ActivityRequirement = { scope: "page" | "resource"; target: string; action: ResourceAction | "access"; label: string };
const historyPage: ActivityRequirement = { scope: "page", target: "/history", action: "access", label: "Akses halaman Riwayat (/history)" };
const transactionRead: ActivityRequirement = { scope: "resource", target: "transaction", action: "read", label: "Lihat transaksi (transaction.read)" };
const requirement = (target: string, action: ResourceAction, label: string): ActivityRequirement => ({ scope: "resource", target, action, label: `${label} (${target}.${action})` });

export const RBAC_HISTORY_ACTIVITIES = [
  { id: "history-open", label: "Buka Riwayat", requirements: [historyPage] },
  { id: "history-read", label: "Lihat transaksi", requirements: [historyPage, transactionRead], warnWhenPageAccessible: true },
  { id: "history-update", label: "Ubah transaksi", requirements: [historyPage, transactionRead, requirement("transaction", "update", "Ubah transaksi")] },
  { id: "history-void", label: "Void transaksi", requirements: [historyPage, transactionRead, requirement("transaction", "update", "Void transaksi")] },
  { id: "history-delete", label: "Hapus transaksi", requirements: [historyPage, transactionRead, requirement("transaction", "delete", "Hapus transaksi")] },
  { id: "history-approve", label: "Setujui transaksi", requirements: [historyPage, transactionRead, requirement("transaction.approve", "update", "Setujui transaksi")] },
  { id: "history-reject", label: "Tolak transaksi", requirements: [historyPage, transactionRead, requirement("transaction.approve", "delete", "Tolak transaksi")] },
  { id: "history-draft", label: "Setujui draft", requirements: [historyPage, transactionRead, requirement("transaction.draft", "update", "Setujui draft")] },
];

export function isActivityRequirementAllowed(role: EditableRole, permissions: RolePermissions, item: ActivityRequirement) {
  return item.scope === "page"
    ? Boolean(permissions[role].pages[item.target])
    : item.action !== "access" && !OWNER_LOCKED_RESOURCE_TARGETS.has(item.target) && canRolePerformAction(role, item.target, item.action, permissions);
}

export function buildEffectiveActivities(role: EditableRole, permissions: RolePermissions) {
  return RBAC_HISTORY_ACTIVITIES.map((activity) => {
    const missing = activity.requirements.filter((item) => !isActivityRequirementAllowed(role, permissions, item));
    const actionRequirement = activity.requirements.at(-1)!;
    const actionGranted = isActivityRequirementAllowed(role, permissions, actionRequirement);
    return {
      ...activity,
      available: missing.length === 0,
      missing,
      actionGranted,
      shouldWarn: missing.length > 0 && (actionGranted || ("warnWhenPageAccessible" in activity && isActivityRequirementAllowed(role, permissions, historyPage))),
      note: role === "SALES" && activity.id === "history-draft"
        ? "Sales tidak dapat menyetujui draft yang dibuat Sales (requestedById terisi), meskipun izin Ubah draft aktif. Batas data Riwayat tetap berlaku."
        : undefined,
    };
  });
}
