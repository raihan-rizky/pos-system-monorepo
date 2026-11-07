import { describe, expect, it } from "vitest";
import {
  compareReceiptSnapshots,
  formatReceiptCurrency,
  formatReceiptDate,
  getReceiptSections,
} from "../lib/receipt-comparison";
import {
  receiptItem as item,
  receiptSnapshot as original,
} from "./receipt-change-fixture";

const rows = (after: typeof original, before = original) =>
  compareReceiptSnapshots(before, after).flatMap((group) => group.fields);

describe("rincian terstruktur perubahan nota", () => {
  it("tetap menunjukkan pergantian identitas dengan nama yang sama", () => {
    const result = rows({ ...original, customerId: "customer-other" });
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ID pelanggan terdaftar",
          before: "customer-demo",
          after: "customer-other",
        }),
      ]),
    );
    expect(
      getReceiptSections(original)
        .flatMap((section) => section.fields)
        .find((field) => field.key === "customerId")?.technical,
    ).toBe(true);
  });
  it("tidak menyamarkan selisih pecahan kecil atau waktu dalam detik yang sama", () => {
    const result = rows({
      ...original,
      total: 40000.0001,
      invoiceDate: "2026-11-05T02:45:00.001Z",
    });
    expect(result).toHaveLength(2);
    for (const field of result) expect(field.before).not.toBe(field.after);
    expect(formatReceiptCurrency(0.0001)).toContain("0001");
    expect(formatReceiptDate(original.invoiceDate)).toContain("WIB");
  });
  it("menganggap waktu yang sama dengan zona berbeda sebagai waktu yang sama", () => {
    expect(
      rows({ ...original, invoiceDate: "2026-11-05T09:45:00+07:00" }),
    ).toEqual([]);
  });
  it("mengabaikan susunan barang dan pembayaran yang isinya tetap sama", () => {
    const before = {
      ...original,
      items: [item, { ...item, productId: "other", productName: "Kertas" }],
      payments: [
        { method: "CASH", amount: 20000 },
        { method: "QRIS", amount: 20000 },
      ],
    };
    expect(
      compareReceiptSnapshots(before, {
        ...before,
        items: [...before.items].reverse(),
        payments: [...before.payments].reverse(),
      }),
    ).toEqual([]);
  });
  it("mencocokkan barang identik lebih dahulu saat produk yang sama muncul berulang", () => {
    const before = {
      ...original,
      items: [item, { ...item, quantity: 1, subtotal: 20000 }],
    };
    const after = {
      ...before,
      items: [{ ...item, quantity: 4, subtotal: 80000 }, item],
    };
    const result = compareReceiptSnapshots(before, after);
    expect(result).toHaveLength(1);
    expect(result[0].kind).toBeUndefined();
    expect(result[0].fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Jumlah",
          before: "1 meter",
          after: "4 meter",
        }),
      ]),
    );
  });
  it("menampilkan semua barang yang ambigu tanpa mengarang pasangan revisi", () => {
    const before = {
      ...original,
      items: [
        { ...item, quantity: 1 },
        { ...item, quantity: 2 },
      ],
    };
    const after = {
      ...before,
      items: [
        { ...item, quantity: 3 },
        { ...item, quantity: 4 },
      ],
    };
    const result = compareReceiptSnapshots(before, after);
    expect(result.filter((group) => group.kind === "removed")).toHaveLength(2);
    expect(result.filter((group) => group.kind === "added")).toHaveLength(2);
  });
  it("menampilkan perubahan barang tanpa ID dan barang yang dihapus", () => {
    const before = { ...original, items: [{ ...item, productId: null }] };
    expect(
      compareReceiptSnapshots(before, {
        ...before,
        items: [{ ...item, productId: null, quantity: 3 }],
      })[0].fields,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Jumlah", after: "3 meter" }),
      ]),
    );
    expect(
      compareReceiptSnapshots(original, { ...original, items: [] })[0],
    ).toMatchObject({ kind: "removed", title: "Cetak banner" });
  });
  it("memperlihatkan pembayaran campuran dan pembayaran piutang", () => {
    const result = rows({
      ...original,
      paymentMethod: "QRIS",
      payments: [
        { method: "CASH", amount: 10000 },
        { method: "QRIS", amount: 30000 },
      ],
      debtPayments: [{ method: "TRANSFER", amount: 5000 }],
    });
    expect(result.find((field) => field.key === "payments")?.after).toContain(
      "QRIS",
    );
    expect(
      result.find((field) => field.key === "debtPayments")?.after,
    ).toContain("5.000");
  });
  it("membedakan baris percetakan dan perubahan identitas atau lebar kolom", () => {
    const document = {
      customerName: "Pelanggan contoh",
      customerPhone: "",
      customerId: "c-1",
      date: "2026-11-05",
      note: "",
      completionDate: "",
      completionTime: "",
      receiver: "",
      setter: "",
      signatory: "",
      columnWidths: [30, 40],
      lines: [
        {
          id: "line-1",
          name: "Banner",
          material: "Flexi",
          quantity: 2,
          price: 20000,
          stockLink: null,
        },
      ],
    };
    const before = {
      ...original,
      printingReceipt: { number: "SP-001", subcategory: "SPANDUK", document },
    };
    const after = {
      ...before,
      printingReceipt: {
        ...before.printingReceipt,
        document: {
          ...document,
          customerId: "c-2",
          columnWidths: [35, 35],
          lines: [{ ...document.lines[0], quantity: 3 }],
        },
      },
    };
    const result = rows(after, before);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ID pelanggan di nota Percetakan",
          after: "c-2",
        }),
        expect.objectContaining({ label: "Lebar kolom", after: "35 · 35 mm" }),
        expect.objectContaining({ label: "Jumlah", before: "2", after: "3" }),
      ]),
    );
    expect(
      compareReceiptSnapshots(original, before).some(
        (group) => group.category === "printing",
      ),
    ).toBe(true);
  });
});
