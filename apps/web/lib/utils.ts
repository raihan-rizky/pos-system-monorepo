// Format Rupiah currency
export function formatRupiah(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

// Compact Rupiah for chart axes / dense labels: "5jt", "500rb", "1,2M"
export function formatRupiahCompact(value: number): string {
  if (!Number.isFinite(value)) return "0";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}${(abs / 1_000_000_000).toFixed(1).replace(".", ",")}M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1).replace(".", ",")}jt`;
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000)}rb`;
  }
  return `${sign}${Math.round(abs)}`;
}

// Generate invoice number: INV-YYYYMMDD-XXXX
export function generateInvoiceNumber(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `INV-${date}-${random}`;
}

// Format date to Indonesian locale
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return "-";

  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsedDate);
}

// Debounce utility
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  ms: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
}

// Get default product image based on category name
export function getDefaultProductImage(categoryName?: string | null): string {
  if (!categoryName) return "/images/atk_default.png";

  const lowerName = categoryName.toLowerCase();

  if (lowerName.includes("kertas") || lowerName.includes("plano") || lowerName.includes("fc")) return "/images/kertas_default.png";
  if (lowerName.includes("tinta") || lowerName.includes("toner")) return "/images/tinta_default.png";
  if (lowerName.includes("cartridge") || lowerName.includes("katrid") || lowerName.includes("catridge")) return "/images/cartridge_default.png";
  if (lowerName.includes("id card") || lowerName.includes("idcard")) return "/images/idcard_default.png";
  if (lowerName.includes("cetak") || lowerName.includes("prnt") || lowerName.includes("jasa")) return "/images/print-warna.png";
  if (lowerName.includes("banner") || lowerName.includes("baliho") || lowerName.includes("stiker") || lowerName.includes("stamp")) return "/images/all-banner.png";
  if (lowerName.includes("fotocopy") || lowerName.includes("fc ")) return "/images/fotocopy.png";
  if (lowerName.includes("laminat")) return "/images/laminating.png";
  if (lowerName.includes("amplop")) return "/images/amplop-putih-polos.png";

  return "/images/atk_default.png";
}
