import { describe, expect, it } from "vitest";
import { buildTransactionHistoryQuickDateRange } from "../date-range";

describe("buildTransactionHistoryQuickDateRange", () => {
  const now = new Date("2026-06-21T10:00:00+07:00");

  it("builds a daily range for today in Jakarta time", () => {
    expect(buildTransactionHistoryQuickDateRange("daily", now)).toEqual({
      dateFrom: "2026-06-21",
      dateTo: "2026-06-21",
    });
  });

  it("builds an inclusive weekly range for the last seven days", () => {
    expect(buildTransactionHistoryQuickDateRange("weekly", now)).toEqual({
      dateFrom: "2026-06-15",
      dateTo: "2026-06-21",
    });
  });

  it("builds a month-to-date range", () => {
    expect(buildTransactionHistoryQuickDateRange("monthly", now)).toEqual({
      dateFrom: "2026-06-01",
      dateTo: "2026-06-21",
    });
  });
});
