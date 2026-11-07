import { describe, expect, it } from "vitest";
import {
  normalizeInboundPayments,
  validateInboundPayments,
} from "../inbound-payment";

describe("inbound payment validation", () => {
  it("accepts two giro rows with different due dates when their total matches", () => {
    const payments = [
      { method: "GIRO" as const, amount: 700_000, dueDate: "2026-11-14", note: "7 hari" },
      { method: "GIRO" as const, amount: 1_300_000, dueDate: "2026-12-07", note: "30 hari" },
    ];

    expect(validateInboundPayments(2_000_000, payments)).toEqual({
      totalAmount: 2_000_000,
      payments,
    });
  });

  it.each([
    [1_999_999, "total pembayaran harus sama"],
    [2_000_001, "total pembayaran harus sama"],
  ])("rejects payment total %s", (total, message) => {
    expect(() =>
      validateInboundPayments(2_000_000, [
        { method: "GIRO", amount: total, dueDate: "2026-11-14" },
      ]),
    ).toThrow(new RegExp(message, "i"));
  });

  it("requires a valid due date for giro and no due date for transfer", () => {
    expect(() =>
      validateInboundPayments(100_000, [
        { method: "GIRO", amount: 100_000, dueDate: null },
      ]),
    ).toThrow(/jatuh tempo/i);

    expect(() =>
      validateInboundPayments(100_000, [
        { method: "TRANSFER", amount: 100_000, dueDate: "2026-11-14" },
      ]),
    ).toThrow(/transfer.*tanggal|tanggal.*transfer/i);
  });

  it("normalizes legacy single payment fields when no payment rows exist", () => {
    expect(
      normalizeInboundPayments({
        totalAmount: 500_000,
        payments: [],
        legacy: { method: "GIRO", dueDate: "2026-11-14" },
      }),
    ).toEqual({
      source: "legacy",
      payments: [{ method: "GIRO", amount: 500_000, dueDate: "2026-11-14", note: null }],
    });
  });
  it.each([0, -1, Number.NaN, Infinity, 1.001, 10_000_000_000])("rejects invalid amount %s", (amount) => {
    expect(() => validateInboundPayments(amount, [{ method: "TRANSFER", amount }])).toThrow();
  });

  it("rejects unsupported methods and invalid calendar dates", () => {
    expect(() => validateInboundPayments(10, [{ method: "CASH" as never, amount: 10 }])).toThrow(/metode/i);
    expect(() => validateInboundPayments(10, [{ method: "GIRO", amount: 10, dueDate: "2026-02-30" }])).toThrow(/jatuh tempo/i);
  });

  it("rejects an explicit empty schedule", () => {
    expect(() => validateInboundPayments(10, [])).toThrow(/satu pembayaran/i);
  });
  it("preserves a legacy zero-total purchase without permitting explicit zero payments", () => {
    expect(normalizeInboundPayments({ totalAmount: 0, legacy: { method: "TRANSFER" }, payments: [] }).payments)
      .toEqual([{ method: "TRANSFER", amount: 0, dueDate: null, note: null }]);
    expect(() => validateInboundPayments(0, [{ method: "TRANSFER", amount: 0 }])).toThrow();
  });
});
