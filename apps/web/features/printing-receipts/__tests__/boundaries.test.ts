import { describe, expect, it } from "vitest";
import { createEmptyPrintingReceiptDocument, getPrintingReceiptCheckoutLines, getPrintingReceiptTotal, parsePrintingReceiptDocument, parsePrintingReceiptNumber } from "../domain";

const document = () => ({ ...createEmptyPrintingReceiptDocument(new Date("2026-10-20T00:00:00Z")), lines: [
  { id: "row-1", name: "Cetak", material: "Kertas", quantity: 1, price: 1000, stockLink: null },
] });

describe("batas input nota Percetakan", () => {
  it.each([
    ["2026-10-19T16:59:59.999Z", "2026-10-19"],
    ["2026-10-19T17:00:00.000Z", "2026-10-20"],
    ["2026-12-31T17:00:00.000Z", "2027-01-01"],
  ])("menggunakan tanggal WIB untuk %s", (instant, date) => {
    expect(createEmptyPrintingReceiptDocument(new Date(instant)).date).toBe(date);
  });

  it.each(["2024-02-29", "2000-02-29", "2026-12-31"])("menerima tanggal kalender %s", date => {
    expect(parsePrintingReceiptDocument({ ...document(), date }).date).toBe(date);
  });
  it.each(["2026-02-29", "2100-02-29", "2026-04-31", "2026-00-20", "20-10-2026"])("menolak tanggal kalender %s", date => {
    expect(() => parsePrintingReceiptDocument({ ...document(), date })).toThrow("Tanggal nota tidak valid");
  });

  it.each([
    ["customerName", 200], ["customerPhone", 50], ["note", 5000],
    ["receiver", 200], ["setter", 200], ["signatory", 200],
  ] as const)("menerima batas %s dan menolak satu karakter berlebih", (field, limit) => {
    expect(parsePrintingReceiptDocument({ ...document(), [field]: "x".repeat(limit) })[field]).toHaveLength(limit);
    expect(() => parsePrintingReceiptDocument({ ...document(), [field]: "x".repeat(limit + 1) })).toThrow("Isian terlalu panjang");
  });

  it.each([["name", 500], ["material", 300]] as const)("membatasi teks baris %s", (field, limit) => {
    const source = document();
    expect(parsePrintingReceiptDocument({ ...source, lines: [{ ...source.lines[0], [field]: "x".repeat(limit) }] }).lines[0][field]).toHaveLength(limit);
    expect(() => parsePrintingReceiptDocument({ ...source, lines: [{ ...source.lines[0], [field]: "x".repeat(limit + 1) }] })).toThrow("Isian terlalu panjang");
  });

  it("menjaga pecahan uang tanpa galat penjumlahan floating point", () => {
    const source = document();
    source.lines = [{ ...source.lines[0], quantity: 3, price: 0.1 }, { ...source.lines[0], id: "row-2", quantity: 2, price: 0.2 }];
    expect(getPrintingReceiptTotal(source)).toBe(0.7);
  });
  it("menerima jumlah tepat di batas penyimpanan dan harga nol", () => {
    const source = document();
    expect(getPrintingReceiptTotal({ ...source, lines: [{ ...source.lines[0], price: 9_999_999_999.99 }] })).toBe(9_999_999_999.99);
    expect(getPrintingReceiptCheckoutLines({ ...source, lines: [{ ...source.lines[0], price: 0 }] })[0].price).toBe(0);
  });
  it("menerima 200 baris tanpa menghilangkan urutan atau isi", () => {
    const source = document();
    const lines = Array.from({ length: 200 }, (_, index) => ({ ...source.lines[0], id: `baris-${index}`, name: `Cetak ${index}` }));
    const parsed = parsePrintingReceiptDocument({ ...source, lines });
    expect(getPrintingReceiptCheckoutLines(parsed)).toEqual(lines);
    expect(getPrintingReceiptTotal(parsed)).toBe(200_000);
  });
  it("mendeteksi ID ganda setelah spasi ID dibersihkan", () => {
    const source = document();
    expect(() => parsePrintingReceiptDocument({ ...source, lines: [source.lines[0], { ...source.lines[0], id: " row-1 " }] })).toThrow("ID baris nota tidak boleh sama");
  });
  it("menyebut nomor baris asli setelah baris kosong pada validasi pembayaran", () => {
    const source = document();
    const blank = { ...source.lines[0], id: "blank", name: "", material: "", quantity: null, price: null };
    expect(() => getPrintingReceiptCheckoutLines({ ...source, lines: [blank, { ...source.lines[0], name: "" }] })).toThrow("baris 2");
  });
  it.each(["\u0000", "\t", "\r", "\n", "\u001f", "\u007f"])("menolak karakter kontrol pada nomor nota %j", control => {
    expect(() => parsePrintingReceiptNumber(`PL${control}001`)).toThrow("satu baris");
  });
  it.each(["iNv-test", "pnwTLD001", "pnw-tld001"])("melindungi awalan nomor otomatis tanpa membedakan huruf %s", number => {
    expect(() => parsePrintingReceiptNumber(number)).toThrow("awalan nota lain");
  });
});
