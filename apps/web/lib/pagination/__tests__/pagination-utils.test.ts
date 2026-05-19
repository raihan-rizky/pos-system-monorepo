import { describe, it, expect } from "vitest";
import { calculatePaginationInfo, PaginationInfo } from "../pagination-utils";

describe("calculatePaginationInfo", () => {
  it("calculates correct total pages for exact division", () => {
    const result = calculatePaginationInfo({
      totalItems: 200,
      itemsPerPage: 100,
      currentPage: 1,
    });
    expect(result.totalPages).toBe(2);
    expect(result.currentPage).toBe(1);
    expect(result.pageDisplay).toBe("1/2");
  });

  it("calculates correct total pages with remainder", () => {
    const result = calculatePaginationInfo({
      totalItems: 250,
      itemsPerPage: 100,
      currentPage: 1,
    });
    expect(result.totalPages).toBe(3);
    expect(result.pageDisplay).toBe("1/3");
  });

  it("handles single page correctly", () => {
    const result = calculatePaginationInfo({
      totalItems: 50,
      itemsPerPage: 100,
      currentPage: 1,
    });
    expect(result.totalPages).toBe(1);
    expect(result.pageDisplay).toBe("1/1");
  });

  it("handles zero items", () => {
    const result = calculatePaginationInfo({
      totalItems: 0,
      itemsPerPage: 100,
      currentPage: 1,
    });
    expect(result.totalPages).toBe(0);
    expect(result.pageDisplay).toBe("0/0");
  });

  it("displays correct page on page 2", () => {
    const result = calculatePaginationInfo({
      totalItems: 250,
      itemsPerPage: 100,
      currentPage: 2,
    });
    expect(result.totalPages).toBe(3);
    expect(result.pageDisplay).toBe("2/3");
  });

  it("displays correct page on last page", () => {
    const result = calculatePaginationInfo({
      totalItems: 250,
      itemsPerPage: 100,
      currentPage: 3,
    });
    expect(result.totalPages).toBe(3);
    expect(result.pageDisplay).toBe("3/3");
  });

  it("handles large numbers correctly", () => {
    const result = calculatePaginationInfo({
      totalItems: 4900,
      itemsPerPage: 100,
      currentPage: 1,
    });
    expect(result.totalPages).toBe(49);
    expect(result.pageDisplay).toBe("1/49");
  });

  it("handles edge case with 1 item", () => {
    const result = calculatePaginationInfo({
      totalItems: 1,
      itemsPerPage: 100,
      currentPage: 1,
    });
    expect(result.totalPages).toBe(1);
    expect(result.pageDisplay).toBe("1/1");
  });
});
