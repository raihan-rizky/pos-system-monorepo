import { z } from "zod";
import { PRINTING_SUBCATEGORIES, type PrintingReceiptDocument, type PrintingReceiptLine, type PrintingSubcategory } from "./types";

export const MAX_PRINTING_RECEIPT_AMOUNT = 9_999_999_999.99;
const MAX_AMOUNT_CENTS = Math.round(MAX_PRINTING_RECEIPT_AMOUNT * 100);

export class PrintingReceiptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrintingReceiptValidationError";
  }
}

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const text = (max: number) => z.string().max(max, `Isian terlalu panjang (maksimal ${max} karakter).`);
const date = z.string().refine(isCalendarDate, "Tanggal nota tidak valid.");
const optionalDate = z.string().refine(value => value === "" || isCalendarDate(value), "Tanggal selesai tidak valid.");
const price = z.number().min(0).max(MAX_PRINTING_RECEIPT_AMOUNT).multipleOf(0.01);
const lineSchema = z.object({
  id: text(128).trim().min(1),
  name: text(500),
  material: text(300),
  quantity: z.number().int().min(1).max(2_147_483_647).nullable(),
  price: price.nullable(),
  stockLink: z.object({
    productId: text(128).trim().min(1),
    quantity: z.number().positive().max(1_000_000_000),
    unit: text(50).trim().min(1),
  }).nullable(),
});

const documentSchema = z.object({
  title: text(100).refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Judul nota harus ditulis dalam satu baris.").transform(value => value.trim()).optional(),
  customerName: text(200),
  customerPhone: text(50),
  customerId: text(128).trim().min(1).nullable(),
  date,
  note: text(5000),
  completionDate: optionalDate,
  completionTime: z.string().refine(value => value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value), "Jam selesai tidak valid."),
  receiver: text(200),
  setter: text(200),
  signatory: text(200),
  lines: z.array(lineSchema).max(200, "Maksimal 200 baris dalam satu nota."),
}).superRefine((document, ctx) => {
  const ids = new Set<string>();
  let totalCents = 0;
  document.lines.forEach((line, index) => {
    if (ids.has(line.id)) ctx.addIssue({ code: "custom", path: ["lines", index, "id"], message: "ID baris nota tidak boleh sama." });
    ids.add(line.id);
    const cents = Math.round((line.price ?? 0) * 100) * (line.quantity ?? 0);
    totalCents += cents;
    if (!Number.isSafeInteger(cents) || !Number.isSafeInteger(totalCents) || totalCents > MAX_AMOUNT_CENTS) {
      ctx.addIssue({ code: "custom", path: ["lines", index], message: "Jumlah nota melebihi batas nilai transaksi." });
    }
  });
});

export function parsePrintingReceiptDocument(input: unknown): PrintingReceiptDocument {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new PrintingReceiptValidationError(issue.code === "custom" || (issue.code === "too_big" && issue.origin !== "number")
      ? issue.message : "Isian nota belum valid. Periksa jumlah, harga, tanggal, dan bahan stok.");
  }
  return parsed.data;
}

export function createEmptyPrintingReceiptDocument(now: Date = new Date()): PrintingReceiptDocument {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return { customerName: "", customerPhone: "", customerId: null, date, note: "", completionDate: "", completionTime: "", receiver: "", setter: "", signatory: "", lines: [] };
}

export function isPrintingReceiptLineBlank(line: PrintingReceiptLine) {
  return !line.name.trim() && !line.material.trim() && line.quantity === null && line.price === null && line.stockLink === null;
}

export function getPrintingReceiptCheckoutLines(document: PrintingReceiptDocument): (PrintingReceiptLine & { quantity: number; price: number })[] {
  const lines = parsePrintingReceiptDocument(document).lines.map((line, index) => ({ line, index })).filter(({ line }) => !isPrintingReceiptLineBlank(line));
  if (!lines.length) throw new PrintingReceiptValidationError("Isi setidaknya satu barang atau layanan sebelum pembayaran.");
  return lines.map(({ line, index }) => {
    if (!line.name.trim() || line.quantity === null || line.price === null) {
      throw new PrintingReceiptValidationError(`Lengkapi nama, banyaknya, dan harga pada baris ${index + 1}.`);
    }
    return { ...line, name: line.name.trim(), quantity: line.quantity, price: line.price };
  });
}

export function getPrintingReceiptTotal(document: PrintingReceiptDocument): number {
  const parsed = parsePrintingReceiptDocument(document);
  return parsed.lines.reduce((sum, line) => sum + Math.round((line.price ?? 0) * 100) * (line.quantity ?? 0), 0) / 100;
}

export function parsePrintingSubcategory(input: unknown): PrintingSubcategory {
  const parsed = z.enum(PRINTING_SUBCATEGORIES).safeParse(input);
  if (!parsed.success) throw new PrintingReceiptValidationError("Pilih jenis nota percetakan yang tersedia.");
  return parsed.data;
}

export function parsePrintingReceiptNumber(input: unknown): string {
  if (typeof input !== "string" || !input.trim() || input.trim().length > 80 || /[\u0000-\u001f\u007f]/.test(input)) {
    throw new PrintingReceiptValidationError("Nomor nota wajib diisi, maksimal 80 karakter, dan ditulis dalam satu baris.");
  }
  const number = input.trim();
  if (/^INV-/i.test(number) || /^PNW-?TLD/i.test(number)) {
    throw new PrintingReceiptValidationError("Awalan INV-, PNW-TLD, dan PNWTLD digunakan untuk nomor transaksi otomatis. Gunakan awalan nota lain.");
  }
  return number;
}
