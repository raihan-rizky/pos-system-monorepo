export type HelpVisualPage =
  | "settings"
  | "history"
  | "pos"
  | "products"
  | "inventory"
  | "suppliers"
  | "customers"
  | "finance"
  | "shift"
  | "production"
  | "salespersons"
  | "assistant";

export type HelpStepVisual = {
  page: HelpVisualPage;
  target: string;
  callout: string;
  variant?: string;
};

export type HelpStepVisualInputStep = {
  title: string;
  description: string;
  visual?: HelpStepVisual;
};

export type HelpStepVisualResolveInput = {
  role?: string;
  guideId?: string;
  guideTitle?: string;
  step: HelpStepVisualInputStep;
  stepIndex: number;
};

export type HelpVisualTarget = {
  key: string;
  label: string;
  hint?: string;
};

export type HelpVisualGroup = {
  title: string;
  targets: HelpVisualTarget[];
};

export type HelpVisualPageConfig = {
  label: string;
  navLabel: string;
  primaryTarget: string;
  groups: HelpVisualGroup[];
};

export const HELP_VISUAL_PAGE_CONFIG: Record<HelpVisualPage, HelpVisualPageConfig> = {
  settings: {
    label: "Pengaturan",
    navLabel: "Lainnya > Pengaturan",
    primaryTarget: "settings-primary",
    groups: [
      {
        title: "Panel Pengaturan",
        targets: [
          { key: "settings-primary", label: "Halaman Pengaturan" },
          { key: "settings-sidebar", label: "Menu Pengaturan" },
          { key: "settings-info-store", label: "Tab Info Toko" },
          { key: "settings-rbac-tab", label: "Tab RBAC" },
          { key: "settings-whatsapp-tab", label: "Tab WhatsApp" },
        ],
      },
      {
        title: "Area Review",
        targets: [
          { key: "settings-rbac-summary", label: "Ringkasan Role" },
          { key: "settings-rbac-matrix", label: "Matrix Modul" },
          { key: "settings-permission-checkbox", label: "Centang Izin" },
          { key: "settings-review-save", label: "Review & Simpan" },
          { key: "settings-save", label: "Simpan Perubahan" },
        ],
      },
    ],
  },
  history: {
    label: "Riwayat",
    navLabel: "Operasi > Riwayat",
    primaryTarget: "history-primary",
    groups: [
      {
        title: "Daftar Transaksi",
        targets: [
          { key: "history-primary", label: "Halaman Riwayat" },
          { key: "history-filter", label: "Filter Status / Tanggal" },
          { key: "history-table", label: "Tabel Transaksi" },
          { key: "history-action-menu", label: "Menu Titik Tiga" },
          { key: "history-approval-actions", label: "Setujui / Tolak" },
        ],
      },
      {
        title: "Detail & Dokumen",
        targets: [
          { key: "history-detail-panel", label: "Panel Detail" },
          { key: "history-print-button", label: "Cetak Invoice" },
          { key: "history-surat-jalan-action", label: "Cetak Surat Jalan" },
          { key: "history-invoice-date-action", label: "Ubah Tanggal Invoice" },
          { key: "history-upload-proof", label: "Upload Bukti" },
          { key: "history-debt-payment", label: "Bayar Cicilan" },
        ],
      },
    ],
  },
  pos: {
    label: "Kasir POS",
    navLabel: "Operasi > Kasir",
    primaryTarget: "pos-primary",
    groups: [
      {
        title: "Layar Kasir",
        targets: [
          { key: "pos-primary", label: "Halaman Kasir" },
          { key: "pos-products", label: "Grid Produk" },
          { key: "pos-cart", label: "Keranjang" },
          { key: "pos-pay-button", label: "Tombol Bayar" },
          { key: "pos-expense-button", label: "Pengeluaran" },
        ],
      },
      {
        title: "Pembayaran",
        targets: [
          { key: "pos-payment-modal", label: "Modal Pembayaran" },
          { key: "pos-payment-method", label: "Metode Bayar" },
          { key: "pos-invoice-date", label: "Tanggal Invoice" },
          { key: "pos-print", label: "Cetak Struk" },
        ],
      },
    ],
  },
  products: {
    label: "Produk",
    navLabel: "Katalog > Produk",
    primaryTarget: "products-primary",
    groups: [
      {
        title: "Pusat Produk",
        targets: [
          { key: "products-primary", label: "Halaman Produk" },
          { key: "products-add-button", label: "Tambah Produk" },
          { key: "products-table", label: "Tabel Produk" },
          { key: "products-edit-action", label: "Ubah Produk" },
          { key: "products-price-action", label: "Ubah Harga" },
        ],
      },
      {
        title: "Tab & Import",
        targets: [
          { key: "products-import", label: "Menu Import" },
          { key: "products-special-price-tab", label: "Harga Khusus" },
          { key: "products-stock-group-tab", label: "Aktivitas Grup" },
          { key: "products-price-history-tab", label: "Riwayat Harga" },
          { key: "products-stock-field", label: "Stok Saat Ini" },
        ],
      },
    ],
  },
  inventory: {
    label: "Inventaris",
    navLabel: "Manajemen Inventaris > Inventaris",
    primaryTarget: "inventory-primary",
    groups: [
      {
        title: "Workspace Inventaris",
        targets: [
          { key: "inventory-primary", label: "Halaman Inventaris" },
          { key: "inventory-tabs", label: "Tab Ringkasan / Riwayat" },
          { key: "inventory-input-menu", label: "Input / Transaksi" },
          { key: "inventory-update-stock", label: "Update Stok" },
          { key: "inventory-day-session", label: "Check In / Check Out" },
          { key: "inventory-tasks", label: "Tugas Harian" },
        ],
      },
      {
        title: "Operasional Gudang",
        targets: [
          { key: "inventory-damaged", label: "Laporkan Barang Rusak" },
          { key: "inventory-weekly-proof", label: "Proof Kebersihan" },
          { key: "inventory-inbound", label: "Penerimaan Barang" },
          { key: "inventory-stock-log-tab", label: "Log Stok" },
          { key: "inventory-approval-actions", label: "Setujui / Tolak Log" },
          { key: "inventory-out-log", label: "Log OUT Belum Diverifikasi" },
          { key: "inventory-correction", label: "Koreksi Log" },
          { key: "inventory-matching", label: "Matching Stok Harian" },
          { key: "inventory-surat-jalan", label: "Surat Jalan" },
        ],
      },
    ],
  },
  suppliers: {
    label: "Supplier",
    navLabel: "Katalog > Supplier",
    primaryTarget: "suppliers-primary",
    groups: [
      {
        title: "Supplier",
        targets: [
          { key: "suppliers-primary", label: "Halaman Supplier" },
          { key: "suppliers-list", label: "Daftar Supplier" },
          { key: "suppliers-add", label: "Tambah Supplier" },
          { key: "suppliers-shopping-tab", label: "Tab Daftar Belanja" },
        ],
      },
      {
        title: "Daftar Belanja",
        targets: [
          { key: "suppliers-create-request", label: "Buat Daftar Belanja" },
          { key: "suppliers-add-products", label: "Cari & Tambah Produk" },
          { key: "suppliers-request-quantity", label: "Requested Quantity" },
          { key: "suppliers-approve", label: "Setujui Belanja" },
        ],
      },
    ],
  },
  customers: {
    label: "Pelanggan",
    navLabel: "Pelanggan > Pelanggan",
    primaryTarget: "customers-primary",
    groups: [
      {
        title: "CRM",
        targets: [
          { key: "customers-primary", label: "Halaman Pelanggan" },
          { key: "customers-add", label: "Pelanggan Baru" },
          { key: "customers-table", label: "Tabel Pelanggan" },
          { key: "customers-filter-debt", label: "Filter Memiliki Piutang" },
        ],
      },
      {
        title: "Piutang",
        targets: [
          { key: "customers-profile", label: "Profil Pelanggan" },
          { key: "customers-history-tab", label: "Riwayat Transaksi" },
          { key: "customers-debt-tab", label: "Tab Piutang" },
          { key: "customers-pay-debt", label: "Bayar Piutang" },
        ],
      },
    ],
  },
  finance: {
    label: "Keuangan",
    navLabel: "Keuangan",
    primaryTarget: "finance-primary",
    groups: [
      {
        title: "Laporan",
        targets: [
          { key: "finance-primary", label: "Halaman Keuangan" },
          { key: "finance-summary", label: "Kartu Ringkasan" },
          { key: "finance-date-filter", label: "Filter Tanggal" },
          { key: "finance-export", label: "Ekspor" },
        ],
      },
      {
        title: "Pengeluaran",
        targets: [
          { key: "finance-expense-create", label: "Tambah Pengeluaran" },
          { key: "finance-expense-form", label: "Form Pengeluaran" },
          { key: "finance-proof-url", label: "Unggah Bukti" },
          { key: "finance-save", label: "Simpan Pengeluaran" },
        ],
      },
    ],
  },
  shift: {
    label: "Shift Kasir",
    navLabel: "Lainnya > Shift Kasir",
    primaryTarget: "shift-primary",
    groups: [
      {
        title: "Shift",
        targets: [
          { key: "shift-primary", label: "Halaman Shift" },
          { key: "shift-open", label: "Mulai Shift" },
          { key: "shift-opening-cash", label: "Modal Laci" },
          { key: "shift-close", label: "Tutup Shift" },
          { key: "shift-closing-cash", label: "Uang Tutup Laci" },
          { key: "shift-history", label: "Riwayat Shift" },
          { key: "shift-edit", label: "Edit Shift" },
        ],
      },
    ],
  },
  production: {
    label: "Produksi",
    navLabel: "Produksi",
    primaryTarget: "production-primary",
    groups: [
      {
        title: "Kanban Produksi",
        targets: [
          { key: "production-primary", label: "Halaman Produksi" },
          { key: "production-kanban", label: "Papan Kanban" },
          { key: "production-status-column", label: "Kolom Status" },
          { key: "production-card", label: "Kartu Pesanan" },
          { key: "production-whatsapp", label: "Tombol WhatsApp" },
        ],
      },
    ],
  },
  salespersons: {
    label: "Tim Sales",
    navLabel: "Pelanggan > Sales",
    primaryTarget: "salespersons-primary",
    groups: [
      {
        title: "Tim Sales",
        targets: [
          { key: "salespersons-primary", label: "Halaman Tim Sales" },
          { key: "salespersons-summary", label: "Ringkasan Performa" },
          { key: "salespersons-list", label: "Daftar Sales" },
          { key: "salespersons-add", label: "Tambah Sales" },
          { key: "salespersons-toggle", label: "Toggle Aktif" },
          { key: "salespersons-detail", label: "Detail Sales" },
        ],
      },
    ],
  },
  assistant: {
    label: "AI Assistant",
    navLabel: "Tombol Pak Teladan",
    primaryTarget: "assistant-primary",
    groups: [
      {
        title: "Pak Teladan",
        targets: [
          { key: "assistant-primary", label: "Widget AI Assistant" },
          { key: "assistant-button", label: "Tombol Robot" },
          { key: "assistant-input", label: "Kolom Pertanyaan" },
          { key: "assistant-answer", label: "Jawaban Pak Teladan" },
          { key: "assistant-workflow-stepper", label: "Diagram Langkah" },
          { key: "assistant-status", label: "Status Proses" },
        ],
      },
    ],
  },
};

function normalize(value: string) {
  return value.toLowerCase();
}

function includesAny(value: string, words: string[]) {
  return words.some((word) => value.includes(word));
}

export function isKnownHelpVisualPage(page: string): page is HelpVisualPage {
  return page in HELP_VISUAL_PAGE_CONFIG;
}

export function isKnownHelpVisualTarget(visual: Pick<HelpStepVisual, "page" | "target">) {
  const config = HELP_VISUAL_PAGE_CONFIG[visual.page];
  if (!config) return false;
  return config.groups.some((group) => group.targets.some((target) => target.key === visual.target));
}

export function getHelpVisualTargetLabel(visual: Pick<HelpStepVisual, "page" | "target">) {
  const config = HELP_VISUAL_PAGE_CONFIG[visual.page];
  for (const group of config.groups) {
    const found = group.targets.find((target) => target.key === visual.target);
    if (found) return found.label;
  }
  return config.label;
}

function firstSentence(value: string) {
  const sentence = value.split(/[.!?]/)[0]?.trim() || value.trim();
  if (sentence.length <= 140) return sentence;
  return `${sentence.slice(0, 137).trim()}...`;
}

function inferPage(input: HelpStepVisualResolveInput): HelpVisualPage {
  const text = normalize(`${input.role ?? ""} ${input.guideId ?? ""} ${input.guideTitle ?? ""} ${input.step.title} ${input.step.description}`);

  if (input.role === "AI_ASSISTANT" || text.includes("ai assistant") || text.includes("pak teladan")) return "assistant";
  if (includesAny(text, ["rbac", "pengaturan", "whatsapp", "info toko"])) return "settings";
  if (includesAny(text, ["shift", "laci"])) return "shift";
  if (includesAny(text, ["produksi", "kanban", "job order", "pickup"])) return "production";
  if (includesAny(text, ["tim sales", "performa sales", "anggota sales", "salesperson"])) return "salespersons";
  if (includesAny(text, ["supplier", "pemasok", "daftar belanja", "shopping request"])) return "suppliers";
  if (includesAny(text, ["pelanggan", "piutang", "crm", "customer", "utang", "bon"])) return "customers";
  if (includesAny(text, ["laporan keuangan", "keuangan", "pengeluaran", "expense", "ekspor laporan"])) return "finance";
  if (includesAny(text, ["inventaris", "inventory", "gudang", "log stok", "penerimaan barang", "barang rusak", "update stok", "matching stok", "check in", "check out"])) return "inventory";
  if (includesAny(text, ["produk", "harga", "hpp", "stok individual", "import", "grup stok", "stock group"])) return "products";
  if (includesAny(text, ["riwayat", "invoice", "faktur", "transaksi pending", "surat jalan", "cicilan", "draft"])) return "history";
  if (includesAny(text, ["kasir", "pos", "bayar", "checkout", "struk"])) return "pos";

  return "history";
}

function targetForPage(page: HelpVisualPage, input: HelpStepVisualResolveInput) {
  const text = normalize(`${input.guideId ?? ""} ${input.guideTitle ?? ""} ${input.step.title} ${input.step.description}`);

  switch (page) {
    case "settings":
      if (text.includes("rbac")) return "settings-rbac-tab";
      if (text.includes("matrix")) return "settings-rbac-matrix";
      if (includesAny(text, ["centang", "izin", "permission"])) return "settings-permission-checkbox";
      if (includesAny(text, ["review", "konfirmasi"])) return "settings-review-save";
      if (includesAny(text, ["info toko", "nama toko", "alamat"])) return "settings-info-store";
      if (includesAny(text, ["simpan"])) return "settings-save";
      return text.includes("buka") ? "settings-sidebar" : "settings-primary";
    case "history":
      if (includesAny(text, ["filter", "pending"])) return "history-filter";
      if (includesAny(text, ["titik tiga", "aksi", "menu"])) return "history-action-menu";
      if (includesAny(text, ["setujui", "tolak", "approval"])) return "history-approval-actions";
      if (includesAny(text, ["tanggal invoice", "ubah tanggal"])) return "history-invoice-date-action";
      if (includesAny(text, ["cetak", "print", "struk"])) return "history-print-button";
      if (includesAny(text, ["surat jalan"])) return "history-surat-jalan-action";
      if (includesAny(text, ["bukti", "upload", "lampiran"])) return "history-upload-proof";
      if (includesAny(text, ["cicilan", "piutang"])) return "history-debt-payment";
      if (includesAny(text, ["detail", "timeline"])) return "history-detail-panel";
      return "history-table";
    case "pos":
      if (includesAny(text, ["produk", "layanan", "item", "pilih"])) return "pos-products";
      if (includesAny(text, ["keranjang", "kuantitas"])) return "pos-cart";
      if (includesAny(text, ["bayar", "checkout", "konfirmasi"])) return "pos-pay-button";
      if (includesAny(text, ["metode", "tunai", "qris", "debit", "transfer"])) return "pos-payment-method";
      if (includesAny(text, ["tanggal invoice", "jam invoice"])) return "pos-invoice-date";
      if (includesAny(text, ["pengeluaran", "expense", "dompet"])) return "pos-expense-button";
      if (includesAny(text, ["cetak", "struk"])) return "pos-print";
      return "pos-primary";
    case "products":
      if (includesAny(text, ["tambah produk", "produk baru"])) return "products-add-button";
      if (includesAny(text, ["ubah harga", "harga langsung"])) return "products-price-action";
      if (includesAny(text, ["edit", "ubah produk", "hpp", "detail"])) return "products-edit-action";
      if (includesAny(text, ["stok saat ini", "stok individual"])) return "products-stock-field";
      if (includesAny(text, ["import", "excel", "mapping", "unggah"])) return "products-import";
      if (includesAny(text, ["harga khusus", "diskon"])) return "products-special-price-tab";
      if (includesAny(text, ["grup stok", "stock group", "aktivitas grup"])) return "products-stock-group-tab";
      if (includesAny(text, ["riwayat harga", "pantau riwayat"])) return "products-price-history-tab";
      return text.includes("cari") ? "products-table" : "products-primary";
    case "inventory":
      if (includesAny(text, ["tab", "riwayat", "ringkasan"])) return "inventory-tabs";
      if (includesAny(text, ["input / transaksi", "input", "transaksi"])) return "inventory-input-menu";
      if (includesAny(text, ["rusak", "hilang", "menyusut", "pecah"])) return "inventory-damaged";
      if (includesAny(text, ["proof", "mingguan", "kebersihan"])) return "inventory-weekly-proof";
      if (includesAny(text, ["penerimaan", "inbound", "terima barang"])) return "inventory-inbound";
      if (includesAny(text, ["update stok", "stok bersama", "stok produk ini", "bulk", "single"])) return "inventory-update-stock";
      if (includesAny(text, ["log stok", "mutasi"])) return "inventory-stock-log-tab";
      if (includesAny(text, ["setuju", "tolak", "approval"])) return "inventory-approval-actions";
      if (includesAny(text, ["check in", "check out", "morning"])) return "inventory-day-session";
      if (includesAny(text, ["log out", "verifikasi"])) return "inventory-out-log";
      if (includesAny(text, ["koreksi", "perlu koreksi"])) return "inventory-correction";
      if (includesAny(text, ["matching"])) return "inventory-matching";
      if (includesAny(text, ["surat jalan", "marking"])) return "inventory-surat-jalan";
      if (includesAny(text, ["tugas"])) return "inventory-tasks";
      return "inventory-primary";
    case "suppliers":
      if (includesAny(text, ["tambah supplier", "tambah pemasok"])) return "suppliers-add";
      if (includesAny(text, ["tab daftar belanja", "daftar belanja"])) return "suppliers-shopping-tab";
      if (includesAny(text, ["buat pengajuan", "buat daftar"])) return "suppliers-create-request";
      if (includesAny(text, ["tambah produk", "cari"])) return "suppliers-add-products";
      if (includesAny(text, ["jumlah", "quantity"])) return "suppliers-request-quantity";
      if (includesAny(text, ["setujui", "approve", "keputusan"])) return "suppliers-approve";
      return "suppliers-primary";
    case "customers":
      if (includesAny(text, ["pelanggan baru", "input", "tambah"])) return "customers-add";
      if (includesAny(text, ["filter", "memiliki piutang"])) return "customers-filter-debt";
      if (includesAny(text, ["profil", "detail"])) return "customers-profile";
      if (includesAny(text, ["riwayat transaksi"])) return "customers-history-tab";
      if (includesAny(text, ["piutang", "utang", "bon"])) return "customers-debt-tab";
      if (includesAny(text, ["bayar"])) return "customers-pay-debt";
      return "customers-table";
    case "finance":
      if (includesAny(text, ["tanggal", "rentang", "periode"])) return "finance-date-filter";
      if (includesAny(text, ["ekspor", "excel", "pdf"])) return "finance-export";
      if (includesAny(text, ["tambah pengeluaran", "buka modal"])) return "finance-expense-create";
      if (includesAny(text, ["kategori", "nominal", "keterangan", "isi data"])) return "finance-expense-form";
      if (includesAny(text, ["bukti", "lampiran", "url", "prnt.sc"])) return "finance-proof-url";
      if (includesAny(text, ["simpan"])) return "finance-save";
      return "finance-summary";
    case "shift":
      if (includesAny(text, ["mulai", "buka shift"])) return "shift-open";
      if (includesAny(text, ["modal", "kas awal"])) return "shift-opening-cash";
      if (includesAny(text, ["tutup", "akhiri"])) return "shift-close";
      if (includesAny(text, ["uang tutup", "saldo akhir"])) return "shift-closing-cash";
      if (includesAny(text, ["riwayat"])) return "shift-history";
      if (includesAny(text, ["edit", "koreksi"])) return "shift-edit";
      return "shift-primary";
    case "production":
      if (includesAny(text, ["kanban", "papan"])) return "production-kanban";
      if (includesAny(text, ["status", "kolom", "seret"])) return "production-status-column";
      if (includesAny(text, ["whatsapp", "notifikasi"])) return "production-whatsapp";
      if (includesAny(text, ["kartu"])) return "production-card";
      return "production-primary";
    case "salespersons":
      if (includesAny(text, ["tambah"])) return "salespersons-add";
      if (includesAny(text, ["aktif", "nonaktif", "toggle"])) return "salespersons-toggle";
      if (includesAny(text, ["detail", "klik", "transaksi"])) return "salespersons-detail";
      if (includesAny(text, ["statistik", "ranking", "performa"])) return "salespersons-summary";
      return "salespersons-list";
    case "assistant":
      if (includesAny(text, ["tombol robot", "klik"])) return "assistant-button";
      if (includesAny(text, ["ketik", "tanya", "pertanyaan"])) return "assistant-input";
      if (includesAny(text, ["diagram", "langkah", "workflow"])) return "assistant-workflow-stepper";
      if (includesAny(text, ["status", "proses"])) return "assistant-status";
      if (includesAny(text, ["hasil", "tampil", "jawaban", "laporan", "daftar", "detail"])) return "assistant-answer";
      return "assistant-primary";
    default:
      return "history-primary";
  }
}

export function resolveHelpStepVisual(input: HelpStepVisualResolveInput): HelpStepVisual {
  if (input.step.visual && isKnownHelpVisualTarget(input.step.visual)) return input.step.visual;

  const page = input.step.visual?.page && isKnownHelpVisualPage(input.step.visual.page)
    ? input.step.visual.page
    : inferPage(input);
  const target = targetForPage(page, input);
  const safeTarget = isKnownHelpVisualTarget({ page, target })
    ? target
    : HELP_VISUAL_PAGE_CONFIG[page].primaryTarget;
  const targetLabel = getHelpVisualTargetLabel({ page, target: safeTarget });

  return {
    page,
    target: safeTarget,
    callout: input.step.visual?.callout || `${targetLabel}: ${firstSentence(input.step.description)}`,
    variant: input.step.visual?.variant,
  };
}
