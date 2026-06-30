import { describe, expect, it } from "vitest";

import {
  getDailyMatchingRowStatus,
  summarizeDailyMatchingStatuses,
  type DailyMatchingRowStatus,
} from "../daily-matching-status";

describe("daily matching row status", () => {
  it("does not show a status before the stock input is checked", () => {
    expect(
      getDailyMatchingRowStatus({
        expectedStock: 8,
        physicalStockInput: "8",
        isChecked: false,
      }),
    ).toBe("unchecked");
  });

  it("marks checked rows as matched when warehouse stock equals expectation", () => {
    expect(
      getDailyMatchingRowStatus({
        expectedStock: 8,
        physicalStockInput: "8",
        isChecked: true,
      }),
    ).toBe("matched");
  });

  it("marks checked rows as different when warehouse stock differs from expectation", () => {
    expect(
      getDailyMatchingRowStatus({
        expectedStock: 8,
        physicalStockInput: "7",
        isChecked: true,
      }),
    ).toBe("different");
  });

  it("marks checked rows as invalid when the stock input is empty or negative", () => {
    expect(
      getDailyMatchingRowStatus({
        expectedStock: 8,
        physicalStockInput: "",
        isChecked: true,
      }),
    ).toBe("invalid");
    expect(
      getDailyMatchingRowStatus({
        expectedStock: 8,
        physicalStockInput: "-1",
        isChecked: true,
      }),
    ).toBe("invalid");
  });

  it("summarizes only checked statuses and blocks submit on invalid rows", () => {
    const statuses: DailyMatchingRowStatus[] = [
      "unchecked",
      "matched",
      "different",
      "invalid",
    ];

    expect(summarizeDailyMatchingStatuses(statuses)).toEqual({
      checkedCount: 3,
      matchedCount: 1,
      differentCount: 1,
      invalidCount: 1,
      canSubmit: false,
    });
  });
});
