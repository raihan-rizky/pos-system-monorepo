import type { AssistantToolName } from "./assistant-tool-registry";

type ToolIntent =
  | { kind: "tool"; toolName: "get_low_stock_items"; input: Record<string, never> }
  | { kind: "tool"; toolName: "get_daily_sales_summary"; input: { date: string } }
  | { kind: "tool"; toolName: "get_system_help"; input: { query: string } }
  | { kind: "tool"; toolName: "get_product_search"; input: { query: string; limit: number } }
  | { kind: "tool"; toolName: "get_product_stock"; input: { query: string } }
  | { kind: "tool"; toolName: "get_product_price"; input: { query: string } }
  | { kind: "tool"; toolName: "get_customer_search"; input: { query: string; limit: number } }
  | { kind: "tool"; toolName: "get_customer_debt_summary"; input: { query: string } }
  | { kind: "tool"; toolName: "get_customer_recap_summary"; input: { query: string; preset: "30d" } }
  | { kind: "tool"; toolName: "get_supplier_search"; input: { query: string; limit: number } }
  | { kind: "tool"; toolName: "get_top_products"; input: { date: string } }
  | { kind: "tool"; toolName: "get_pending_transactions"; input: Record<string, never> }
  | { kind: "tool"; toolName: "exportFinancialReport"; input: { period: "daily" | "weekly" | "monthly" | "30d"; format: "pdf" | "xlsx" } }
  | { kind: "tool"; toolName: "exportCustomerRecap"; input: { period: "daily" | "weekly" | "monthly" | "30d"; format: "pdf" | "xlsx" } }
  | { kind: "tool"; toolName: "analyzeFinancialReport"; input: { period: "daily" | "weekly" | "monthly" | "30d" } }
  | { kind: "tool"; toolName: "openProductModal" | "openCustomerModal" | "openSupplierModal" | "openSalespersonModal" | "openExpenseModal" | "openShiftModal" | "openStockUpdateModal" | "openInboundReceiptModal"; input: Record<string, never> };

type AssistantIntent =
  | ToolIntent
  | { kind: "social_static"; reply: string }
  | { kind: "social_nebius" }
  | { kind: "out_of_scope" }
  | { kind: "unsupported_data"; guidance: string }
  | { kind: "chat" };

export type FastPathIntentName = AssistantToolName | "social_static" | "out_of_scope" | "unsupported_data";

const FAST_PATH_INTENT_NAMES = new Set<FastPathIntentName>([
  "get_system_help",
  "get_low_stock_items",
  "get_daily_sales_summary",
  "get_product_search",
  "get_product_stock",
  "get_product_price",
  "get_customer_search",
  "get_customer_debt_summary",
  "get_customer_recap_summary",
  "get_supplier_search",
  "get_top_products",
  "get_pending_transactions",
  "exportFinancialReport",
  "exportCustomerRecap",
  "analyzeFinancialReport",
  "openProductModal",
  "openCustomerModal",
  "openSupplierModal",
  "openSalespersonModal",
  "openExpenseModal",
  "openShiftModal",
  "openStockUpdateModal",
  "openInboundReceiptModal",
  "social_static",
  "out_of_scope",
  "unsupported_data",
]);

const POS_KEYWORDS = [
  "pos", "produk", "product", "tambah produk", "sku", "harga", "kategori", "barcode", "variasi", "item", "barang",
  "stok", "stock", "inventory", "inventori", "gudang", "opname", "stock opname", "barang masuk", "barang keluar", "stock out", "mutasi", "kartu stok",
  "transaksi", "transaction", "kasir", "cashier", "pembayaran", "checkout", "keranjang", "diskon", "tunai", "qris", "transfer", "kredit", "debit", "struk belanja", "invoice",
  "pelanggan", "customer", "piutang", "utang", "pembeli", "member", "membership", "tagihan", "cicilan",
  "supplier", "pemasok", "vendor", "distributor", "pabrik", "agen",
  "laporan", "report", "keuangan", "omzet", "revenue", "profit", "laba rugi", "penjualan", "sales", "grafik", "analisa", "statistik", "ringkasan",
  "settings", "rbac", "role", "permission", "akses", "pengaturan", "hak akses", "admin", "pengguna", "user", "karyawan", "akun",
  "produksi", "production", "kanban", "job order", "printing", "siap diambil", "sedang diproses", "proses", "selesai", "operator", "papan produksi",
  "salesperson", "tim sales", "tenaga penjual", "komisi", "target", "kinerja sales", "spg", "pramuniaga",
  "shift", "laci", "modal laci", "tutup laci", "selisih", "sesi", "uang laci", "cash drawer", "setor", "buka shift",
  "riwayat", "history", "transaksi lama", "struk", "void", "batal", "refund", "kembali", "surat jalan", "nota", "pengiriman", "detail transaksi",
  "fitur", "menu", "aplikasi", "sistem", "cara", "bagaimana", "bantuan", "help"
];
const OUT_OF_SCOPE_KEYWORDS = ["presiden", "weather", "cuaca", "politik", "resep", "sejarah", "coding", "programming", "matematika", "mathematics", "berita", "news"];

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function isoDateInJakarta(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function cleanQuery(value: string) {
  return value.replace(/[?!.]+$/g, "").trim();
}

function titleQuery(value: string) {
  return cleanQuery(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function hasContextDependencyOrMixedIntent(text: string) {
  const withoutToday = text.replace(/\b(?:hari ini|today)\b/g, "");
  return /\b(?:tadi|sebelumnya|tersebut|yang sama|lanjutkan|ulangi|koreksi|maksud saya|bukan|ini|itu)\b/.test(withoutToday)
    || /\b(?:dan|serta|sekaligus|kemudian|lalu|plus)\b/.test(text)
    || (text.match(/\?/g)?.length ?? 0) > 1;
}

function staticSocialReply(text: string): string | null {
  if (/^(?:halo|hai|hi|hello|pagi|siang|sore|malam)(?: pak tel(?:adan)?| dan)?[!?.]*$/.test(text)) {
    return "Halo, aku Pak Teladan — bisa dipanggil Pak Tel atau Dan. Mau dibantu apa soal sistem POS hari ini?";
  }
  if (/^(?:nama kamu siapa|siapa kamu|who are you)[!?.]*$/.test(text)) {
    return "Aku Pak Teladan, panggil saja Pak Tel atau Dan. Aku membantu menjelaskan fitur POS dan mengecek data melalui alat yang sesuai aksesmu.";
  }
  if (/^(?:kamu )?(?:bisa apa|punya kemampuan apa|capability)[!?.]*$/.test(text)) {
    return "Aku bisa membantu cek stok, produk, pelanggan, penjualan, dan menjelaskan cara memakai fitur POS. Data live selalu dicek melalui alat, bukan diperkirakan.";
  }
  if (/^(?:makasih|terima kasih|thanks|thank you|bye|dadah)[!?.]*$/.test(text)) {
    return "Sama-sama! Kalau butuh bantuan soal POS lagi, panggil Pak Tel atau Dan saja ya.";
  }
  if (/^(?:(?:kasih|beri|buatkan?) )?(?:joke|jokes|tebak-tebakan|lawakan?)(?: dong)?[!?.]*$/.test(text)) {
    return "Wah, pertanyaan bagus ini Mas. Hewan yang paling sederhana itu... Ala kadalnya! Xixixi. Garing ya? Ngopi dulu biar segar.";
  }
  return null;
}

function capture(text: string, pattern: RegExp) {
  const match = pattern.exec(text);
  return match?.[1] ? titleQuery(match[1]) : "";
}

function requestedReportPeriod(text: string): "daily" | "weekly" | "monthly" | "30d" {
  if (/\b(?:30\s*(?:hari|days?)|tiga puluh hari|sebulan terakhir)\b/.test(text)) return "30d";
  if (/\b(?:mingguan|minggu ini|weekly|7\s*hari)\b/.test(text)) return "weekly";
  if (/\b(?:harian|hari ini|daily|today)\b/.test(text)) return "daily";
  if (/\b(?:bulanan|bulan ini|monthly|month to date)\b/.test(text)) return "monthly";
  return "30d";
}

function requestedExportFormat(text: string): "pdf" | "xlsx" {
  return /\b(?:excel|xlsx)\b/.test(text) ? "xlsx" : "pdf";
}

/**
 * Returns a deterministic route only when the complete latest message is
 * context-independent. Anything ambiguous deliberately falls back to the LLM.
 */
export function routeAssistantIntent(message: string, now: Date = new Date()): AssistantIntent {
  const original = message.trim();
  const text = original.toLowerCase();
  if (!text) return { kind: "chat" };

  const staticReply = staticSocialReply(text);
  if (staticReply) return { kind: "social_static", reply: staticReply };

  if (/^(?:lagi ngapain|cerita dong|gimana kabar|mood|gabut|ngobrol)(?: dan)?[!?.]*$/.test(text)) {
    return { kind: "social_nebius" };
  }

  if (hasContextDependencyOrMixedIntent(text)) return { kind: "chat" };

  if (/^(?:(?:tolong )?(?:ekspor|export|unduh|download|buatkan? file) )?(?:rekap |laporan )?(?:keuangan|finansial)(?: toko)?(?:\s+.*)?$/.test(text)
    && /\b(?:rekap|ekspor|export|unduh|download|file|pdf|excel|xlsx)\b/.test(text)) {
    return {
      kind: "tool",
      toolName: "exportFinancialReport",
      input: {
        period: requestedReportPeriod(text),
        format: requestedExportFormat(text),
      },
    };
  }

  if (/^(?:buatkan? |ekspor |export |unduh |download )?(?:file )?rekap (?:semua )?(?:customer|pelanggan)(?:\s+(?:harian|mingguan|bulanan|30\s*hari|pdf|excel|xlsx))*[!?.]*$/.test(text)) {
    return {
      kind: "tool",
      toolName: "exportCustomerRecap",
      input: {
        period: requestedReportPeriod(text),
        format: requestedExportFormat(text),
      },
    };
  }

  if (/^(?:(?:tolong )?(?:analisis|analisa|evaluasi|review)) (?:seluruh |semua |whole )?(?:halaman )?(?:laporan )?(?:keuangan|finansial)(?:\s+.*)?[!?.]*$/.test(text)) {
    return {
      kind: "tool",
      toolName: "analyzeFinancialReport",
      input: { period: requestedReportPeriod(text) },
    };
  }

  const modalRoutes: Array<[RegExp, ToolIntent["toolName"]]> = [
    [/^(?:buka (?:modal|form) )?(?:tambah|buat|input) (?:produk|product)(?: baru)?[!?.]*$/, "openProductModal"],
    [/^(?:buka (?:modal|form) )?(?:tambah|buat|daftarkan) (?:customer|pelanggan)(?: baru)?[!?.]*$/, "openCustomerModal"],
    [/^(?:buka (?:modal|form) )?(?:tambah|buat|daftarkan) (?:supplier|pemasok)(?: baru)?[!?.]*$/, "openSupplierModal"],
    [/^(?:buka (?:modal|form) )?(?:tambah|buat|daftarkan) (?:sales|salesperson)(?: baru)?[!?.]*$/, "openSalespersonModal"],
    [/^(?:buka (?:modal|form) )?(?:catat|tambah|buat) pengeluaran(?: baru)?[!?.]*$/, "openExpenseModal"],
    [/^(?:buka|mulai) shift(?: kasir)?[!?.]*$/, "openShiftModal"],
    [/^(?:buka (?:modal|form) )?(?:update|ubah|sesuaikan) stok (?:satu |1 )?(?:produk|barang)[!?.]*$/, "openStockUpdateModal"],
    [/^(?:buka (?:modal|form) )?(?:input|buat|ajukan) penerimaan barang[!?.]*$/, "openInboundReceiptModal"],
  ];
  const modalRoute = modalRoutes.find(([pattern]) => pattern.test(text));
  if (modalRoute) {
    return { kind: "tool", toolName: modalRoute[1] as ToolIntent["toolName"], input: {} } as ToolIntent;
  }

  if (/^(?:(?:cek|lihat|tampilkan) )?(?:(?:daftar|list) )?(?:(?:produk|barang)(?: (?:apa|mana))? yang )?(?:stok(?:nya)?(?: (?:produk|barang))?|(?:produk|barang) stok(?:nya)?) (?:rendah|menipis|habis|minimum)[!?.]*$/.test(text)) {
    return { kind: "tool", toolName: "get_low_stock_items", input: {} };
  }

  if (/^(?:ringkasan |total )?(?:omzet|revenue|penjualan|sales|pendapatan)(?: toko)? (?:hari ini|today)(?: berapa)?[!?.]*$/.test(text)) {
    return { kind: "tool", toolName: "get_daily_sales_summary", input: { date: isoDateInJakarta(now) } };
  }

  const productSearch = capture(text, /^(?:cari produk|search produk|find product)\s+(.+?)[!?.]*$/);
  if (productSearch) return { kind: "tool", toolName: "get_product_search", input: { query: productSearch, limit: 10 } };

  const productStock = capture(text, /^(?:(?:cek|lihat) )?stok (?:produk |barang )?(.+?)(?: berapa)?[!?.]*$/);
  if (productStock) return { kind: "tool", toolName: "get_product_stock", input: { query: productStock } };

  const productPrice = capture(text, /^(?:(?:cek|lihat) )?harga (?:produk |barang )?(.+?)(?: berapa)?[!?.]*$/);
  if (productPrice) return { kind: "tool", toolName: "get_product_price", input: { query: productPrice } };

  const customerSearch = capture(text, /^(?:cari customer|cari pelanggan|search customer)\s+(.+?)[!?.]*$/);
  if (customerSearch) return { kind: "tool", toolName: "get_customer_search", input: { query: customerSearch, limit: 10 } };

  const customerDebt = capture(text, /^(?:(?:cek|lihat) )?(?:piutang|utang) (?:customer|pelanggan)\s+(.+?)(?: berapa)?[!?.]*$/);
  if (customerDebt) return { kind: "tool", toolName: "get_customer_debt_summary", input: { query: customerDebt } };

  const customerRecap = capture(text, /^(?:(?:cek|lihat) )?rekap (?:customer|pelanggan)\s+(.+?)[!?.]*$/);
  if (customerRecap) return { kind: "tool", toolName: "get_customer_recap_summary", input: { query: customerRecap, preset: "30d" } };

  if (/^(?:bagaimana cara|cara|bantuan|help|tolong jelaskan cara)\s+.+[!?.]*$/.test(text)) {
    return { kind: "tool", toolName: "get_system_help", input: { query: original } };
  }

  const supplierSearch = capture(text, /^(?:cari supplier|cari pemasok|search supplier)\s+(.+?)[!?.]*$/);
  if (supplierSearch) return { kind: "tool", toolName: "get_supplier_search", input: { query: supplierSearch, limit: 10 } };

  if (/^(?:(?:cek|lihat|tampilkan) )?(?:(?:daftar|list) )?(?:transaksi )?(?:pending|belum lunas|belum selesai|dp|draft)[!?.]*$/.test(text)) {
    return { kind: "tool", toolName: "get_pending_transactions", input: {} };
  }

  if (/^(?:produk|barang) (?:terlaris|best seller|paling laku|paling banyak terjual)(?: hari ini| today)?[!?.]*$/.test(text)) {
    return { kind: "tool", toolName: "get_top_products", input: { date: isoDateInJakarta(now) } };
  }

  if (/^(?:supplier|pemasok) (?:mana|apa|berapa|terbesar|ranking|terbanyak|yang paling sering)(?:\s+.+)?[!?.]*$/.test(text)) {
    return {
      kind: "unsupported_data",
      guidance: "Pak Tel belum bisa mengambil detail peringkat supplier langsung. Silakan cek menu Suppliers atau rekap supplier; Pak Tel bisa membantu menjelaskan cara membacanya tanpa mengarang data.",
    };
  }

  if (includesAny(text, OUT_OF_SCOPE_KEYWORDS) && !includesAny(text, POS_KEYWORDS)) return { kind: "out_of_scope" };
  if (!includesAny(text, POS_KEYWORDS)) return { kind: "out_of_scope" };
  return { kind: "chat" };
}

export function parseFastPathIntentAllowlist(value: string | undefined): ReadonlySet<FastPathIntentName> {
  const enabled = new Set<FastPathIntentName>();
  for (const candidate of value?.split(",") ?? []) {
    const name = candidate.trim() as FastPathIntentName;
    if (FAST_PATH_INTENT_NAMES.has(name)) enabled.add(name);
  }
  return enabled;
}

export function getFastPathIntentName(intent: AssistantIntent): FastPathIntentName | null {
  if (intent.kind === "tool") return intent.toolName;
  if (intent.kind === "social_static" || intent.kind === "out_of_scope" || intent.kind === "unsupported_data") {
    return intent.kind;
  }
  return null;
}

export type { AssistantIntent };
