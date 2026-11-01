import { describe, expect, it } from "vitest";
import { recognizedExpenseFilter } from "../recognized-expense-filter";

describe("batas pengakuan pengeluaran dalam WIB", () => {
  it.each([
    ["2026-11-09T16:59:59.999Z", "2026-11-09T17:00:00.000Z"],
    ["2026-11-09T17:00:00.000Z", "2026-11-10T17:00:00.000Z"],
    ["2026-12-31T17:00:00.000Z", "2027-01-01T17:00:00.000Z"],
    ["2028-02-28T17:00:00.000Z", "2028-02-29T17:00:00.000Z"],
  ])("menghitung akhir hari WIB untuk waktu %s", (now, cutoff) => {
    expect(recognizedExpenseFilter(new Date(now))).toEqual({
      OR: [
        { backdatedPurchaseDueId: null },
        { occurredAt: { lt: new Date(cutoff) } },
      ],
    });
  });
});
