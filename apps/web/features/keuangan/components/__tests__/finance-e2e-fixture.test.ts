import { describe, expect, it, vi } from "vitest";
import type { Page, Route } from "@playwright/test";

vi.mock("@playwright/test", () => ({ test: { extend: () => ({}) }, expect: {} }));
import { mockApis } from "../../../../e2e/fixtures/app";

describe("fixture ringkasan Keuangan untuk E2E", () => {
  it("uses the split permission contracts with consistent cash totals", async () => {
    const handlers: Array<(route: Route) => Promise<void>> = [];
    const page = { route: async (_pattern: string, handler: (route: Route) => Promise<void>) => { handlers.push(handler); } } as unknown as Page;
    await mockApis(page);
    async function response(path: string) {
      let body: Record<string, unknown> = {};
      const route = {
        request: () => ({ url: () => `http://localhost${path}`, method: () => "GET" }),
        fulfill: async (value: { body: string }) => { body = JSON.parse(value.body); },
      } as unknown as Route;
      await handlers[1](route);
      return body;
    }
    const income = await response("/api/finance/income/summary");
    const expense = await response("/api/finance/expenses/summary");
    const combined = await response("/api/finance/cash-flow/summary");
    expect((income.cashDaily as Array<{ total: number }>).reduce((sum, row) => sum + row.total, 0)).toBe(income.cashTotal);
    expect((expense.cashDaily as Array<{ total: number }>).reduce((sum, row) => sum + row.total, 0)).toBe((expense.cashExpense as { total: number }).total);
    expect(combined.income).toEqual({ total: income.cashTotal, daily: income.cashDaily });
    expect(combined.expense).toEqual({ ...expense.cashExpense as object, daily: expense.cashDaily });
    expect(expense).not.toHaveProperty("netCashFlow");
  });
});
