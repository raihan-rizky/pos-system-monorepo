type ToolIntent =
  | { kind: "tool"; toolName: "get_low_stock_items"; input: Record<string, never> }
  | { kind: "tool"; toolName: "get_daily_sales_summary"; input: { date: string } }
  | { kind: "tool"; toolName: "get_system_help"; input: { query: string } }
  | { kind: "tool"; toolName: "get_product_search"; input: { query: string; limit: number } }
  | { kind: "tool"; toolName: "get_product_stock"; input: { query: string } }
  | { kind: "tool"; toolName: "get_product_price"; input: { query: string } }
  | { kind: "tool"; toolName: "get_customer_search"; input: { query: string; limit: number } }
  | { kind: "tool"; toolName: "get_customer_debt_summary"; input: { query: string } }
  | { kind: "tool"; toolName: "get_customer_recap_summary"; input: { query: string; preset: "30d" } };

type AssistantIntent =
  | ToolIntent
  | { kind: "social_static"; reply: string }
  | { kind: "social_nebius" }
  | { kind: "out_of_scope" }
  | { kind: "unsupported_data"; guidance: string }
  | { kind: "chat" };

const POS_KEYWORDS = ["pos", "produk", "product", "stok", "stock", "inventory", "inventori", "transaksi", "transaction", "penjualan", "sales", "omzet", "revenue", "profit", "pelanggan", "customer", "supplier", "laporan", "report", "kasir", "cashier", "invoice", "nota", "surat jalan", "harga", "pembayaran", "utang", "piutang", "fitur", "menu", "aplikasi", "sistem", "cara", "bagaimana", "bantuan", "help"];
const OUT_OF_SCOPE_KEYWORDS = ["presiden", "weather", "cuaca", "politik", "resep", "sejarah", "coding", "programming", "matematika", "mathematics", "berita", "news"];

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function cleanQuery(value: string) {
  return value.replace(/[?!.]/g, "").trim();
}

function afterKeyword(text: string, keyword: string) {
  return cleanQuery(text.slice(text.indexOf(keyword) + keyword.length));
}

function titleQuery(value: string) {
  return cleanQuery(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function staticSocialReply(text: string): string | null {
  if (/^(halo|hai|hi|hello|pagi|siang|sore|malam)\b/.test(text)) {
    return "Halo, aku Pak Teladan — bisa dipanggil Pak Tel atau Dan. Sure, mau dibantu apa soal sistem POS hari ini?";
  }
  if (/nama kamu|siapa kamu|who are you/.test(text)) {
    return "Aku Pak Teladan, panggil aja Pak Tel atau Dan. Aku bantu jelasin fitur POS, cek data via tool, dan keep it clear gaya Jaksel.";
  }
  if (/bisa apa|kemampuan|capability/.test(text)) {
    return "Aku bisa bantu cek stok, produk, customer, penjualan, dan jelasin cara pakai fitur POS. Untuk data live, aku pakai tool biar based on data, bukan ngarang.";
  }
  if (/makasih|terima kasih|thanks|thank you|bye|dadah/.test(text)) {
    return "Anytime! Kalau butuh insight POS lagi, panggil Tel atau Dan aja ya.";
  }
  if (/joke|jokes|tebak|lawak|luc/.test(text)) {
    return "Wah, pertanyaan bagus ini Mas. Hewan yang paling sederhana itu... Ala kadalnya! Xixixi. Gimana, garing ya? Yaudah ngopi dulu biar seger.";
  }
  return null;
}

export function routeAssistantIntent(message: string, now: Date = new Date()): AssistantIntent {
  const text = message.toLowerCase().trim();
  const staticReply = staticSocialReply(text);
  if (staticReply) return { kind: "social_static", reply: staticReply };

  if (/lagi ngapain|cerita dong|gimana kabar|mood|gabut|ngobrol/.test(text)) {
    return { kind: "social_nebius" };
  }

  if (/cari produk|search produk|find product/.test(text)) {
    return { kind: "tool", toolName: "get_product_search", input: { query: titleQuery(afterKeyword(text, "produk")), limit: 10 } };
  }

  if (/harga/.test(text) && /produk|product|berapa/.test(text)) {
    return { kind: "tool", toolName: "get_product_price", input: { query: titleQuery(text.replace(/harga|produk|product|berapa/g, "")) } };
  }

  if (/stok|stock|minimum|menipis|rendah|habis/.test(text)) {
    if (/rendah|menipis|habis|minimum/.test(text) && /(apa|mana|daftar|list|produk yang|produk apa)/.test(text)) {
      return { kind: "tool", toolName: "get_low_stock_items", input: {} };
    }
    const query = titleQuery(text.replace(/cek|tolong|coba|lihat|barang|item|stok|stock|minimum|menipis|rendah|habis|berapa|produk|yang|nya/g, ""));
    if (query) return { kind: "tool", toolName: "get_product_stock", input: { query } };
    return { kind: "tool", toolName: "get_low_stock_items", input: {} };
  }

  if (/cari customer|cari pelanggan|search customer/.test(text)) {
    return { kind: "tool", toolName: "get_customer_search", input: { query: titleQuery(text.replace(/cari|customer|pelanggan|search/g, "")), limit: 10 } };
  }

  if (/piutang|debt|utang/.test(text) && /customer|pelanggan/.test(text)) {
    const query = titleQuery(text.replace(/cek|tolong|coba|lihat|ringkasan|rekap|daftar|list|data|semua|piutang|debt|utang|customer|pelanggan|berapa|siapa/g, ""));
    if (query) return { kind: "tool", toolName: "get_customer_debt_summary", input: { query } };
    return { kind: "chat" };
  }

  if (/rekap/.test(text) && /customer|pelanggan/.test(text)) {
    const query = titleQuery(text.replace(/cek|tolong|coba|lihat|ringkasan|rekap|daftar|list|data|semua|customer|pelanggan|siapa/g, ""));
    if (query) return { kind: "tool", toolName: "get_customer_recap_summary", input: { query, preset: "30d" } };
    return { kind: "chat" };
  }

  if (/omzet|revenue|penjualan|sales|pendapatan/.test(text) && /hari ini|today|harian/.test(text)) {
    return { kind: "tool", toolName: "get_daily_sales_summary", input: { date: isoDate(now) } };
  }

  if (/cara|bagaimana|bantuan|help|fitur|menu|pakai|menggunakan/.test(text)) {
    return { kind: "tool", toolName: "get_system_help", input: { query: message } };
  }

  if (/supplier|pemasok/.test(text) && /(mana|berapa|terbesar|ranking|terbanyak|rekap|data|list|daftar|sering)/.test(text)) {
    return { kind: "unsupported_data", guidance: "Sure, aku belum bisa ambil data supplier detail langsung dari tool. Kamu bisa cek menu Suppliers atau recap supplier di aplikasi. Aku bisa bantu jelasin step by step cara bacanya, tapi aku nggak akan ngarang angka atau nama supplier." };
  }

  if (includesAny(text, OUT_OF_SCOPE_KEYWORDS) && !includesAny(text, POS_KEYWORDS)) return { kind: "out_of_scope" };
  if (!includesAny(text, POS_KEYWORDS)) return { kind: "out_of_scope" };
  return { kind: "chat" };
}

export type { AssistantIntent };
