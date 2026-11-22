import { describe, expect, it } from "vitest";
import { projectPayableLedger } from "../payable-ledger";

const base = {
  payableId: "debt-1",
  amountCents: 100_000_000,
  debtDate: "2026-11-01",
  dueDate: "2026-11-10",
  todayWib: "2026-11-16",
  payments: [],
};

const project = projectPayableLedger;

describe("manual payable settlement", () => {
  it("keeps a debt without a due date open", () => {
    expect(project({ ...base, dueDate: null })).toMatchObject({ remainingCents: 100_000_000, payments: [] });
  });

  it("keeps a future-dated debt outside the current ledger instead of failing an earlier report", () => {
    expect(project({ ...base, debtDate: "2026-11-20", dueDate: "2026-11-25" })).toMatchObject({ remainingCents: 0, payments: [] });
  });

  it("does not settle a future due date", () => {
    expect(project({ ...base, dueDate: "2026-11-17" })).toMatchObject({ remainingCents: 100_000_000, payments: [] });
  });

  it("settles only the unpaid balance on the due date", () => {
    const input = { ...base, payments: [{ id: "partial", amountCents: 40_000_000, paidAt: "2026-11-05", origin: "MANUAL" as const }] };
    const expected = {
      remainingCents: 0,
      payments: [
        { id: "partial", amountCents: 40_000_000, paidAt: "2026-11-05", origin: "MANUAL" },
        { id: "auto:debt-1", amountCents: 60_000_000, paidAt: "2026-11-10", origin: "AUTO" },
      ],
    };
    expect(project(input)).toEqual(expected);
    expect(project(input)).toEqual(expected);
  });

  it("retains an already-recorded manual payment after the due date without a duplicate", () => {
    expect(project({ ...base, dueDate: "2026-11-01", payments: [{ id: "late", amountCents: 100_000_000, paidAt: "2026-11-05", origin: "MANUAL" }] }))
      .toMatchObject({ remainingCents: 0, payments: [{ id: "late", paidAt: "2026-11-05", amountCents: 100_000_000, origin: "MANUAL" }] });
  });

  it("settles the remainder when a historical manual payment was partial and late", () => {
    expect(project({ ...base, dueDate: "2026-11-01", payments: [{ id: "late", amountCents: 40_000_000, paidAt: "2026-11-05", origin: "MANUAL" }] }))
      .toMatchObject({ remainingCents: 0, payments: [
        { id: "auto:debt-1", paidAt: "2026-11-01", amountCents: 60_000_000, origin: "AUTO" },
        { id: "late", paidAt: "2026-11-05", amountCents: 40_000_000, origin: "MANUAL" },
      ] });
  });

  it("retains a corrected automatic payment and does not recreate it", () => {
    expect(project({ ...base, payments: [{ id: "corrected", amountCents: 100_000_000, paidAt: "2026-11-12", origin: "CORRECTED_AUTO" }] }))
      .toMatchObject({ remainingCents: 0, payments: [{ id: "corrected", paidAt: "2026-11-12", amountCents: 100_000_000, origin: "CORRECTED_AUTO" }] });
  });

  it("reuses a materialized automatic payment when the ledger is projected again", () => {
    const input = { ...base, payments: [
      { id: "partial", amountCents: 40_000_000, paidAt: "2026-11-05", origin: "MANUAL" as const },
      { id: "persisted-auto", amountCents: 60_000_000, paidAt: "2026-11-10", origin: "AUTO" as const },
    ] };
    expect(project(input)).toMatchObject({ remainingCents: 0, payments: [
      { id: "partial", amountCents: 40_000_000, origin: "MANUAL" },
      { id: "persisted-auto", paidAt: "2026-11-10", amountCents: 60_000_000, origin: "AUTO" },
    ] });
  });

  it("recalculates a materialized automatic payment after a historical manual correction", () => {
    const input = { ...base, payments: [
      { id: "late", amountCents: 40_000_000, paidAt: "2026-11-12", origin: "MANUAL" as const },
      { id: "persisted-auto", amountCents: 100_000_000, paidAt: "2026-11-10", origin: "AUTO" as const },
    ] };
    expect(project(input)).toMatchObject({ remainingCents: 0, payments: [
      { id: "persisted-auto", paidAt: "2026-11-10", amountCents: 60_000_000, origin: "AUTO" },
      { id: "late", paidAt: "2026-11-12", amountCents: 40_000_000, origin: "MANUAL" },
    ] });
  });

  it("rejects multiple persisted automatic payments for the same debt", () => {
    expect(() => project({ ...base, payments: [
      { id: "auto-1", amountCents: 1, paidAt: "2026-11-10", origin: "AUTO" },
      { id: "auto-2", amountCents: 1, paidAt: "2026-11-10", origin: "AUTO" },
    ] })).toThrow();
  });

  it("keeps cents exact and rejects overpayment", () => {
    expect(project({ ...base, amountCents: 100_050, payments: [{ id: "fraction", amountCents: 50_025, paidAt: "2026-11-03", origin: "MANUAL" }] }))
      .toMatchObject({ remainingCents: 0, payments: [
        { id: "fraction", amountCents: 50_025 },
        { id: "auto:debt-1", amountCents: 50_025 },
      ] });
    expect(() => project({ ...base, amountCents: 100_050, payments: [{ id: "too-much", amountCents: 100_051, paidAt: "2026-11-03", origin: "MANUAL" }] })).toThrow();
  });

  it("rejects duplicate payment IDs and invalid dates", () => {
    const payment = { id: "same", amountCents: 100, paidAt: "2026-11-03", origin: "MANUAL" as const };
    expect(() => project({ ...base, payments: [payment, payment] })).toThrow();
    expect(() => project({ ...base, dueDate: "2026-02-31" })).toThrow();
    expect(() => project({ ...base, payments: [{ ...payment, paidAt: "2026-11-17" }] })).toThrow();
  });
});
