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

  it("includes bundled surat jalan filter when selected", () => {
    expect(
      buildTransactionHistorySearchParams({
        suratJalan: "bundled",
        page: 3,
      }).toString(),
    ).toBe("suratJalan=bundled&page=3&limit=10");
  });

  it("serializes an ATK subcategory and drops an unrelated printing subcategory", () => {
    const params = buildTransactionHistorySearchParams({
      transactionCategory: "ATK", categoryId: "paper", printingSubcategory: "PRINT", page: 2,
    });
    expect(params.get("transactionCategory")).toBe("ATK");
    expect(params.get("categoryId")).toBe("paper");
    expect(params.has("printingSubcategory")).toBe(false);
    expect(params.get("page")).toBe("2");
  });

  it("serializes the printing subcategory and drops an unrelated product category", () => {
    const params = buildTransactionHistorySearchParams({
      transactionCategory: "PERCETAKAN", categoryId: "paper", printingSubcategory: "SPANDUK",
    });
    expect(params.get("transactionCategory")).toBe("PERCETAKAN");
    expect(params.get("printingSubcategory")).toBe("SPANDUK");
    expect(params.has("categoryId")).toBe(false);
  });

  it("does not send dependent filters without a parent category", () => {
    const params = buildTransactionHistorySearchParams({ categoryId: "paper", printingSubcategory: "PRINT" });
    expect(params.has("categoryId")).toBe(false);
    expect(params.has("printingSubcategory")).toBe(false);
  });
});
