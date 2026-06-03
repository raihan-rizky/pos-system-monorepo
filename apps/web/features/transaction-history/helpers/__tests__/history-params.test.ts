import { describe, expect, it } from "vitest";
import { buildTransactionHistorySearchParams } from "../history-params";

describe("buildTransactionHistorySearchParams", () => {
  it("includes status filter when selected", () => {
    expect(
      buildTransactionHistorySearchParams({
        search: "INV-001",
        status: "PENDING_APPROVAL",
        page: 2,
      }).toString(),
    ).toBe("search=INV-001&status=PENDING_APPROVAL&page=2&limit=10");
  });

  it("omits empty status filter", () => {
    expect(
      buildTransactionHistorySearchParams({
        status: "",
        page: 1,
      }).toString(),
    ).toBe("page=1&limit=10");
  });
});
