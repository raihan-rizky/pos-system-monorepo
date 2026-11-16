import { describe, expect, it } from "vitest";
import * as recognition from "../purchase-expense-recognition";

type Input = {
  asOf: string;
  schedule: Array<{ id: string; method: "GIRO"; amountCents: number; dueDate: string }>;
  payments: Array<{ id: string; method: "GIRO"; amountCents: number; paidAt: string }>;
};
type Result = { incomplete: boolean; rows: Array<{ kind: string; date: string; amountCents: number }> };

describe("pengakuan pengeluaran pembelian", () => {
  it("mencatat pembayaran awal dan sisa pada jatuh tempo tanpa mencatat ulang pembayaran terlambat", () => {
    const calculate = (recognition as { recognizePurchaseExpenses?: (input: Input) => Result }).recognizePurchaseExpenses;
    expect(calculate).toBeTypeOf("function");
    if (!calculate) return;

    const result = calculate({
      asOf: "2026-12-31",
      schedule: [{ id: "giro-1", method: "GIRO", amountCents: 10_000_000, dueDate: "2026-12-15" }],
      payments: [
        { id: "early", method: "GIRO", amountCents: 3_000_000, paidAt: "2026-11-10" },
        { id: "late", method: "GIRO", amountCents: 7_000_000, paidAt: "2026-12-20" },
      ],
    });

    expect(result.incomplete).toBe(false);
    expect(result.rows).toMatchObject([
      { kind: "giro_payment", date: "2026-11-10", amountCents: 3_000_000 },
      { kind: "giro_due", date: "2026-12-15", amountCents: 7_000_000 },
    ]);
    expect(result.rows).toHaveLength(2);
  });
});

describe("rincian pengakuan dan koreksi pembelian", () => {
  const calculate = recognition.recognizePurchaseExpenses as unknown as (input: {
    asOf: string;
    schedule: Array<{ id: string; method: "GIRO" | "TRANSFER"; amountCents: number; dueDate: string | null }>;
    payments: Array<{ id: string; method: "GIRO" | "TRANSFER"; amountCents: number; paidAt: string }>;
  }) => Result;

  it("memisahkan transfer dan pembayaran giro pada tanggal pembayarannya", () => {
    const result = calculate({
      asOf: "2026-11-20",
      schedule: [
        { id: "transfer", method: "TRANSFER", amountCents: 2_000_000, dueDate: null },
        { id: "giro", method: "GIRO", amountCents: 8_000_000, dueDate: "2026-12-15" },
      ],
      payments: [
        { id: "transfer-paid", method: "TRANSFER", amountCents: 2_000_000, paidAt: "2026-11-05" },
        { id: "giro-paid", method: "GIRO", amountCents: 3_000_000, paidAt: "2026-11-10" },
      ],
    });
    expect(result.incomplete).toBe(false);
    expect(result.rows).toMatchObject([
      { kind: "transfer", date: "2026-11-05", amountCents: 2_000_000 },
      { kind: "giro_payment", date: "2026-11-10", amountCents: 3_000_000 },
    ]);
    expect(result.rows).toHaveLength(2);
  });

  it("menampilkan kelebihan pembayaran yang belum dikembalikan setelah nilai dikoreksi", () => {
    const result = calculate({
      asOf: "2026-11-20",
      schedule: [{ id: "giro", method: "GIRO", amountCents: 7_000_000, dueDate: "2026-11-30" }],
      payments: [{ id: "payment", method: "GIRO", amountCents: 10_000_000, paidAt: "2026-11-10" }],
    });
    expect(result.rows).toMatchObject([
      { kind: "giro_payment", date: "2026-11-10", amountCents: 7_000_000 },
      { kind: "overpayment", date: "2026-11-10", amountCents: 3_000_000 },
    ]);
    expect(result.rows).toHaveLength(2);
  });

  it("menggunakan jatuh tempo terbaru dan menyimpan pembayaran yang sudah terjadi", () => {
    const result = calculate({
      asOf: "2026-11-30",
      schedule: [{ id: "giro", method: "GIRO", amountCents: 10_000_000, dueDate: "2026-12-15" }],
      payments: [{ id: "payment", method: "GIRO", amountCents: 3_000_000, paidAt: "2026-11-10" }],
    });
    expect(result.rows).toMatchObject([{ kind: "giro_payment", date: "2026-11-10", amountCents: 3_000_000 }]);
    expect(result.rows).toHaveLength(1);
  });
});

describe("kelengkapan dan alokasi giro", () => {
  const calculate = recognition.recognizePurchaseExpenses as unknown as (input: {
    asOf: string;
    historyVerified?: boolean;
    schedule: Array<{ id: string; method: "GIRO"; amountCents: number; dueDate: string | null }>;
    payments: Array<{ id: string; method: "GIRO"; amountCents: number; paidAt: string }>;
    allocations?: Array<{ paymentId: string; scheduleId: string; amountCents: number }>;
  }) => Result;

  it("tidak menganggap giro belum diverifikasi sebagai sisa yang pasti", () => {
    const result = calculate({
      asOf: "2026-11-30", historyVerified: false,
      schedule: [{ id: "giro", method: "GIRO", amountCents: 10_000_000, dueDate: "2026-11-20" }],
      payments: [],
    });
    expect(result.incomplete).toBe(true);
    expect(result.rows).toEqual([]);
  });

  it("memakai alokasi yang tersimpan sebelum urutan jatuh tempo", () => {
    const result = calculate({
      asOf: "2026-11-10",
      schedule: [
        { id: "first", method: "GIRO", amountCents: 5_000_000, dueDate: "2026-11-20" },
        { id: "second", method: "GIRO", amountCents: 5_000_000, dueDate: "2026-12-20" },
      ],
      payments: [{ id: "payment", method: "GIRO", amountCents: 1_000_000, paidAt: "2026-11-01" }],
      allocations: [{ paymentId: "payment", scheduleId: "second", amountCents: 1_000_000 }],
    });
    expect(result.incomplete).toBe(false);
    expect(result.rows).toMatchObject([{ kind: "giro_payment", date: "2026-11-01", amountCents: 1_000_000, scheduleId: "second" }]);
  });

  it("menandai jadwal giro tanpa tanggal jatuh tempo sebagai belum lengkap", () => {
    const result = calculate({
      asOf: "2026-11-30",
      schedule: [{ id: "giro", method: "GIRO", amountCents: 10_000_000, dueDate: null }],
      payments: [],
    });
    expect(result.incomplete).toBe(true);
    expect(result.rows).toEqual([]);
  });
});

describe("beberapa jadwal dan data lama", () => {
  it("mengalokasikan pembayaran transfer ke giro setelah perubahan metode tanpa menghitung giro dua kali", () => {
    const result = recognition.recognizePurchaseExpenses({
      asOf: "2026-12-31",
      schedule: [{ id: "giro", method: "GIRO", amountCents: 7_000_000, dueDate: "2026-11-30" }],
      payments: [{ id: "transfer", method: "TRANSFER", amountCents: 10_000_000, paidAt: "2026-11-10" }],
    });
    expect(result.rows).toMatchObject([
      { kind: "transfer", date: "2026-11-10", amountCents: 7_000_000 },
      { kind: "overpayment", date: "2026-11-10", amountCents: 3_000_000 },
    ]);
    expect(result.rows).toHaveLength(2);
  });

  it("tidak menghitung kembali pembayaran transfer untuk giro yang sudah jatuh tempo", () => {
    const result = recognition.recognizePurchaseExpenses({
      asOf: "2026-12-31",
      schedule: [{ id: "giro", method: "GIRO", amountCents: 7_000_000, dueDate: "2026-11-30" }],
      payments: [{ id: "transfer", method: "TRANSFER", amountCents: 10_000_000, paidAt: "2026-12-10" }],
    });
    expect(result.rows).toMatchObject([
      { kind: "giro_due", date: "2026-11-30", amountCents: 7_000_000 },
      { kind: "overpayment", date: "2026-12-10", amountCents: 3_000_000 },
    ]);
    expect(result.rows).toHaveLength(2);
  });
  it("mengalokasikan pembayaran agregat ke giro terdekat dan tidak menghitung ulang pelunasan terlambat", () => {
    const result = recognition.recognizePurchaseExpenses({
      asOf: "2026-12-31",
      schedule: [
        { id: "second", method: "GIRO", amountCents: 6_000_000, dueDate: "2026-12-15" },
        { id: "first", method: "GIRO", amountCents: 4_000_000, dueDate: "2026-11-20" },
      ],
      payments: [
        { id: "early", method: "GIRO", amountCents: 5_000_000, paidAt: "2026-11-10" },
        { id: "late", method: "GIRO", amountCents: 5_000_000, paidAt: "2026-12-20" },
      ],
    });
    expect(result.incomplete).toBe(false);
    expect(result.rows).toMatchObject([
      { kind: "giro_payment", date: "2026-11-10", amountCents: 4_000_000, scheduleId: "first" },
      { kind: "giro_payment", date: "2026-11-10", amountCents: 1_000_000, scheduleId: "second" },
      { kind: "giro_due", date: "2026-12-15", amountCents: 5_000_000, scheduleId: "second" },
    ]);
    expect(result.rows).toHaveLength(3);
  });

  it("mempertahankan alokasi tersimpan untuk pembayaran berikutnya", () => {
    const result = recognition.recognizePurchaseExpenses({
      asOf: "2026-11-10",
      schedule: [
        { id: "first", method: "GIRO", amountCents: 5_000_000, dueDate: "2026-11-20" },
        { id: "second", method: "GIRO", amountCents: 5_000_000, dueDate: "2026-12-20" },
      ],
      payments: [
        { id: "earlier", method: "GIRO", amountCents: 5_000_000, paidAt: "2026-11-01" },
        { id: "allocated", method: "GIRO", amountCents: 5_000_000, paidAt: "2026-11-02" },
      ],
      allocations: [{ paymentId: "allocated", scheduleId: "first", amountCents: 5_000_000 }],
    });
    expect(result.rows).toMatchObject([
      { kind: "giro_payment", scheduleId: "second", amountCents: 5_000_000 },
      { kind: "giro_payment", scheduleId: "first", amountCents: 5_000_000 },
    ]);
  });

  it("menerima jadwal lama bernilai nol tanpa membuat pengeluaran", () => {
    const result = recognition.recognizePurchaseExpenses({
      asOf: "2026-11-30",
      schedule: [{ id: "zero", method: "TRANSFER", amountCents: 0, dueDate: null }],
      payments: [],
    });
    expect(result).toEqual({ incomplete: false, rows: [] });
  });
});
