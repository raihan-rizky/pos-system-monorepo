import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "user-1", storeId: "store-1", authorizationFingerprint: "permissions-1",
  query: null as null | { queryKey: unknown[]; enabled: boolean; queryFn: () => Promise<unknown> },
}));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => state }));
vi.mock("@tanstack/react-query", () => ({ useQuery: (query: typeof state.query) => { state.query = query; return query; } }));
import { useCashFlowSummary, useCustomExpenseCategories, useExpenseList, useExpenseSummary, useIncomeSummary } from "../useKeuangan";

describe("cash flow summary query", () => {
  beforeEach(() => {
    Object.assign(state, { userId: "user-1", storeId: "store-1", authorizationFingerprint: "permissions-1", query: null });
    vi.restoreAllMocks();
  });

  it("scopes cached snapshots by user, store, permissions, and month", () => {
    useCashFlowSummary("2026-11", true);
    expect(state.query?.queryKey).toEqual(["finance", "cash-flow-summary", "user-1", "store-1", "permissions-1", "2026-11"]);
    expect(state.query?.enabled).toBe(true);
    state.userId = "user-2";
    state.storeId = "store-2";
    state.authorizationFingerprint = "permissions-2";
    useCashFlowSummary("2026-10", false);
    expect(state.query?.queryKey).toEqual(["finance", "cash-flow-summary", "user-2", "store-2", "permissions-2", "2026-10"]);
    expect(state.query?.enabled).toBe(false);
  });

  it("loads the combined endpoint without a browser cache", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ month: "2026-11" }), { status: 200 }));
    useCashFlowSummary("2026-11");
    await expect(state.query?.queryFn()).resolves.toEqual({ month: "2026-11" });
    expect(fetchMock).toHaveBeenCalledWith("/api/finance/cash-flow/summary?month=2026-11", { cache: "no-store" });
  });
});

describe("individual finance summary queries", () => {
  beforeEach(() => {
    Object.assign(state, { userId: "user-1", storeId: "store-1", authorizationFingerprint: "permissions-1", query: null });
    vi.restoreAllMocks();
  });

  it.each([
    ["income", useIncomeSummary],
    ["expense", useExpenseSummary],
  ] as const)("scopes %s cached metrics to identity, permissions, month, and mode", (name, hook) => {
    hook("2026-11", true, true);
    expect(state.query?.queryKey).toEqual(["finance", `${name}-summary`, "user-1", "store-1", "permissions-1", "2026-11", "metrics"]);
    state.userId = "user-2";
    state.storeId = "store-2";
    state.authorizationFingerprint = "permissions-2";
    hook("2026-10", false, false);
    expect(state.query?.queryKey).toEqual(["finance", `${name}-summary`, "user-2", "store-2", "permissions-2", "2026-10", "full"]);
    expect(state.query?.enabled).toBe(false);
  });

  it.each([
    [useIncomeSummary, "income"],
    [useExpenseSummary, "expenses"],
  ] as const)("requests metrics only without changing the default endpoint", async (hook, endpoint) => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ month: "2026-11" }), { status: 200 }));
    hook("2026-11", true, true);
    await state.query?.queryFn();
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/finance/${endpoint}/summary?month=2026-11&metricsOnly=1`, { cache: "no-store" });
    hook("2026-11");
    await state.query?.queryFn();
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/finance/${endpoint}/summary?month=2026-11`, { cache: "no-store" });
  });
});

describe("expense detail query isolation", () => {
  beforeEach(() => {
    Object.assign(state, { userId: "user-1", storeId: "store-1", authorizationFingerprint: "permissions-1", query: null });
  });

  it("scopes expense categories to identity, store and permissions", () => {
    useCustomExpenseCategories();
    expect(state.query?.queryKey).toEqual(["finance", "expense-categories", "user-1", "store-1", "permissions-1"]);
    state.storeId = "store-2";
    state.authorizationFingerprint = "permissions-2";
    useCustomExpenseCategories(false);
    expect(state.query?.queryKey).toEqual(["finance", "expense-categories", "user-1", "store-2", "permissions-2"]);
    expect(state.query?.enabled).toBe(false);
  });

  it("scopes the expense list to identity, store, permissions and filters", () => {
    useExpenseList("2026-11", 2, "RENT", true);
    expect(state.query?.queryKey).toEqual(["finance", "expense-list", "user-1", "store-1", "permissions-1", "2026-11", 2, "RENT"]);
    state.userId = "user-2";
    state.storeId = "store-2";
    state.authorizationFingerprint = "permissions-2";
    useExpenseList("2026-10", 1, null, false);
    expect(state.query?.queryKey).toEqual(["finance", "expense-list", "user-2", "store-2", "permissions-2", "2026-10", 1, "all"]);
    expect(state.query?.enabled).toBe(false);
  });
});
