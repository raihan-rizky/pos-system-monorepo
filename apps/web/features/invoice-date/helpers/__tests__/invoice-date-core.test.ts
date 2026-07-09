import { describe, expect, it } from "vitest";
import {
  buildDraftDocumentNumber,
  buildInvoiceDocumentNumber,
  chooseDocumentSequence,
  parseDocumentDate,
  requiresInvoiceDateReason,
  resolveInvoiceDateTime,
} from "../invoice-date-core";

describe("resolveInvoiceDateTime", () => {
  it("uses current approval time when creating with a custom date but no custom time", () => {
    const resolved = resolveInvoiceDateTime({
      mode: "create",
      date: "2026-07-01",
      now: new Date("2026-07-09T08:45:30.000Z"),
    });

    expect(resolved.toISOString()).toBe("2026-07-01T08:45:30.000Z");
  });

  it("preserves previous invoice time when editing with no custom time", () => {
    const resolved = resolveInvoiceDateTime({
      mode: "edit",
      date: "2026-07-01",
      now: new Date("2026-07-09T08:45:30.000Z"),
      previousInvoiceDate: new Date("2026-06-30T03:15:00.000Z"),
    });

    expect(resolved.toISOString()).toBe("2026-07-01T03:15:00.000Z");
  });

  it("uses explicitly selected time when provided", () => {
    const resolved = resolveInvoiceDateTime({
      mode: "edit",
      date: "2026-07-01",
      time: "14:05",
      now: new Date("2026-07-09T08:45:30.000Z"),
      previousInvoiceDate: new Date("2026-06-30T03:15:00.000Z"),
    });

    expect(resolved.toISOString()).toBe("2026-07-01T07:05:00.000Z");
  });
});

describe("requiresInvoiceDateReason", () => {
  it("requires a reason for past or future invoice dates, but not same-day time changes", () => {
    const now = new Date("2026-07-09T08:45:30.000Z");

    expect(
      requiresInvoiceDateReason({
        invoiceDate: new Date("2026-07-09T02:00:00.000Z"),
        now,
      }),
    ).toBe(false);
    expect(
      requiresInvoiceDateReason({
        invoiceDate: new Date("2026-07-08T08:45:30.000Z"),
        now,
      }),
    ).toBe(true);
    expect(
      requiresInvoiceDateReason({
        invoiceDate: new Date("2026-07-10T08:45:30.000Z"),
        now,
      }),
    ).toBe(true);
  });
});

describe("document numbers", () => {
  it("builds invoice and draft numbers from the invoice date", () => {
    const invoiceDate = new Date("2026-07-01T08:45:30.000Z");

    expect(buildInvoiceDocumentNumber(invoiceDate, 7)).toBe("INV-20260701-0007");
    expect(buildDraftDocumentNumber(invoiceDate, 7)).toBe("PNW-TLD-20260701-007");
  });

  it("keeps the old suffix if available on the target date, otherwise uses next highest", () => {
    expect(
      chooseDocumentSequence({
        currentSequence: 12,
        existingSequencesForDate: [1, 2, 13],
      }),
    ).toBe(12);

    expect(
      chooseDocumentSequence({
        currentSequence: 12,
        existingSequencesForDate: [1, 12, 13],
      }),
    ).toBe(14);
  });

  it("parses dates from existing invoice and draft numbers for backfill", () => {
    expect(parseDocumentDate("INV-20260701-0007")?.toISOString()).toBe(
      "2026-07-01T00:00:00.000Z",
    );
    expect(parseDocumentDate("PNW-TLD-20260702-007")?.toISOString()).toBe(
      "2026-07-02T00:00:00.000Z",
    );
    expect(parseDocumentDate("not-a-document")).toBeNull();
  });
});
