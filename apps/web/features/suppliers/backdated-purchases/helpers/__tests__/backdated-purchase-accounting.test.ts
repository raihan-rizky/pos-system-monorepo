import { describe, expect, it } from "vitest";

import { calculateBackdatedRecognition } from "../backdated-purchase-accounting";

describe("calculateBackdatedRecognition", () => {
  it("records payments made by the due date and the remaining amount once", () => {
    expect(calculateBackdatedRecognition({
      amountCents: 1_000_000_000,
      dueDate: "2026-11-10",
      payments: [
        { id: "a", amountCents: 400_000_000, paidAt: "2026-10-30" },
        { id: "b", amountCents: 200_000_000, paidAt: "2026-11-02" },
        { id: "c", amountCents: 200_000_000, paidAt: "2026-12-02" },
      ],
    })).toEqual({
      paidCents: 800_000_000,
      remainingCents: 200_000_000,
      dueCents: 400_000_000,
      paymentExpenses: [
        { paymentId: "a", expenseCents: 400_000_000 },
        { paymentId: "b", expenseCents: 200_000_000 },
        { paymentId: "c", expenseCents: 0 },
      ],
    });
  });

  it("treats payments on the due date as payments made by the due date", () => {
    expect(calculateBackdatedRecognition({
      amountCents: 100_00,
      dueDate: "2026-11-10",
      payments: [{ id: "same-day", amountCents: 25_00, paidAt: "2026-11-10" }],
    })).toEqual({
      paidCents: 25_00,
      remainingCents: 75_00,
      dueCents: 75_00,
      paymentExpenses: [{ paymentId: "same-day", expenseCents: 25_00 }],
    });
  });

  it("keeps the full due expense when payment was made after the due date", () => {
    expect(calculateBackdatedRecognition({
      amountCents: 100_00,
      dueDate: "2026-11-10",
      payments: [{ id: "late", amountCents: 100_00, paidAt: "2026-11-11" }],
    })).toEqual({
      paidCents: 100_00,
      remainingCents: 0,
      dueCents: 100_00,
      paymentExpenses: [{ paymentId: "late", expenseCents: 0 }],
    });
  });

  it("has no due expense when the full amount was paid before the due date", () => {
    expect(calculateBackdatedRecognition({
      amountCents: 100_00,
      dueDate: "2026-11-10",
      payments: [{ id: "early", amountCents: 100_00, paidAt: "2026-10-31" }],
    })).toEqual({
      paidCents: 100_00,
      remainingCents: 0,
      dueCents: 0,
      paymentExpenses: [{ paymentId: "early", expenseCents: 100_00 }],
    });
  });

  it("rejects invalid calendar dates and noninteger or unsafe amounts", () => {
    for (const input of [
      { amountCents: 100_00, dueDate: "2026-02-30", payments: [] },
      { amountCents: 100.5, dueDate: "2026-11-10", payments: [] },
      { amountCents: Number.MAX_SAFE_INTEGER + 1, dueDate: "2026-11-10", payments: [] },
      { amountCents: 100_00, dueDate: "2026-11-10", payments: [{ id: "a", amountCents: 1, paidAt: "2026-13-01" }] },
    ]) {
      expect(() => calculateBackdatedRecognition(input)).toThrow();
    }
  });

  it("rejects overpayments and duplicate payment identifiers", () => {
    expect(() => calculateBackdatedRecognition({
      amountCents: 100_00,
      dueDate: "2026-11-10",
      payments: [{ id: "a", amountCents: 101_00, paidAt: "2026-11-10" }],
    })).toThrow();
    expect(() => calculateBackdatedRecognition({
      amountCents: 100_00,
      dueDate: "2026-11-10",
      payments: [
        { id: "a", amountCents: 25_00, paidAt: "2026-11-09" },
        { id: "a", amountCents: 25_00, paidAt: "2026-11-10" },
      ],
    })).toThrow();
  });
});
