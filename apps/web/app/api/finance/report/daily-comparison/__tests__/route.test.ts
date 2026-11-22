import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@pos/db";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({ user: vi.fn(), permissions: vi.fn(), income: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ getCurrentUser: mocks.user, handleAuthError: () => null }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@/features/financial-report/services/daily-income", () => ({ loadIncomePeriod: mocks.income }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

const testUrl = process.env.POS_COMPARISON_TEST_URL;
const safeDatabase = (() => {
  try { const url = new URL(testUrl ?? ""); return ["127.0.0.1", "localhost", "::1"].includes(url.hostname) && url.searchParams.get("schema") === "comparison_integration" && process.env.DATABASE_URL === testUrl && (url.port === "15433" || (process.env.CI === "true" && url.port === "5432" && url.pathname === "/pos_ci")); }
  catch { return false; }
})();
const suffix = randomUUID();
const storeA = `comparison-a-${suffix}`, storeB = `comparison-b-${suffix}`;
const userA = `comparison-user-a-${suffix}`, userB = `comparison-user-b-${suffix}`;
const date = "2026-11-08";
const endpoint = "http://localhost/api/finance/report/daily-comparison";
type Route = typeof import("../route");
let route: Route | null = null;
const read = (query = `date=${date}`) => new Request(`${endpoint}?${query}`);
const save = (payload: unknown, query = "") => new Request(`${endpoint}${query}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

describe.skipIf(!safeDatabase)("daily comparison API on isolated PostgreSQL", () => {
  beforeAll(async () => {
    if (process.env.POS_COMPARISON_TEST_BOOTSTRAP === "1") {
      const url = new URL(testUrl!); url.searchParams.delete("schema");
      const options = { env: { ...process.env, PGOPTIONS: "-c search_path=comparison_integration" }, stdio: "pipe" as const };
      const psql = process.env.PSQL || "psql";
      execFileSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "--dbname", url.toString(), "-f", path.resolve(process.cwd(), "../../packages/db/tests/fixtures/daily-comparison-baseline.sql")], options);
      execFileSync(psql, ["-X", "-v", "ON_ERROR_STOP=1", "--dbname", url.toString(), "-f", path.resolve(process.cwd(), "../../packages/db/prisma/migrations/20261112010000_daily_income_comparison/migration.sql")], options);
    }
    route = await import("../route").catch(() => null);
    await db.store.createMany({ data: [{ id: storeA, name: "Toko A" }, { id: storeB, name: "Toko B" }] });
    await db.user.createMany({ data: [{ id: userA, username: userA, name: "Kasir A", role: "CASHIER", storeId: storeA }, { id: userB, username: userB, name: "Kasir B", role: "CASHIER", storeId: storeB }] });
  }, 30_000);
  beforeEach(async () => {
    await db.dailyIncomeComparison.deleteMany({ where: { storeId: { in: [storeA, storeB] } } });
    mocks.user.mockReset().mockResolvedValue({ id: userA, name: "Kasir A", role: "CASHIER", storeId: storeA });
    mocks.permissions.mockReset().mockResolvedValue(buildDefaultRolePermissions());
    mocks.income.mockReset().mockResolvedValue({ days: [{ date, total: 100.35, paymentMethods: [{ method: "CASH", amount: 100.25 }, { method: "Belum dicatat", amount: 0.1 }] }] });
  });
  afterAll(async () => {
    await db.dailyIncomeComparison.deleteMany({ where: { storeId: { in: [storeA, storeB] } } });
    await db.user.deleteMany({ where: { id: { in: [userA, userB] } } });
    await db.store.deleteMany({ where: { id: { in: [storeA, storeB] } } });
    await db.$disconnect();
  });

  it("saves exact optional values for the selected store and day", async () => {
    expect(route).not.toBeNull(); if (!route) return;
    const response = await route.PUT(save({ date, revision: null, amounts: [{ method: "CASH", amount: "100.10" }, { method: "QRIS", amount: "0" }] }));
    expect(response.status).toBe(200);
    const saved = await response.json();
    expect(saved.comparison).toMatchObject({ date, revision: 1, savedBy: "Kasir A", amounts: expect.arrayContaining([{ method: "CASH", amount: "100.10" }, { method: "QRIS", amount: "0.00" }]), posAtSave: expect.arrayContaining([{ method: "CASH", amount: "100.25" }, { method: "Belum dicatat", amount: "0.10" }]) });
    expect((await (await route.GET(read())).json()).comparison).toMatchObject({ revision: 1 });
    mocks.user.mockResolvedValue({ id: userB, name: "Kasir B", role: "CASHIER", storeId: storeB });
    expect((await (await route.GET(read())).json()).comparison).toBeNull();
    expect((await route.GET(read(`date=${date}&storeId=${storeA}`))).status).toBe(422);
  });

  it("rejects invalid inputs and does not create a comparison", async () => {
    expect(route).not.toBeNull(); if (!route) return;
    for (const amounts of [[{ method: "TEMPO", amount: "1" }], [{ method: "CASH", amount: "-1" }], [{ method: "CASH", amount: "1.001" }], [{ method: "CASH", amount: "1" }, { method: "CASH", amount: "2" }]]) {
      expect((await route.PUT(save({ date, revision: null, amounts }))).status).toBe(422);
    }
    expect((await route.GET(read("date=2099-01-01"))).status).toBe(422);
    expect((await (await route.GET(read())).json()).comparison).toBeNull();
  });

  it("checks comparison and receipt permissions independently, including Sales preview", async () => {
    expect(route).not.toBeNull(); if (!route) return;
    const permissions = buildDefaultRolePermissions();
    permissions.CASHIER.resources["financial-report.daily-comparison"].read = false;
    mocks.permissions.mockResolvedValue(permissions);
    expect((await route.GET(read())).status).toBe(403);
    expect((await route.PUT(save({ date, revision: null, amounts: [] }))).status).toBe(403);
    permissions.CASHIER.resources["financial-report.daily-comparison"].read = true;
    permissions.CASHIER.resources["financial-report.daily-payment-method"].read = false;
    expect((await route.GET(read())).status).toBe(403);
    permissions.CASHIER.resources["financial-report.daily-payment-method"].read = true;
    permissions.CASHIER.resources["financial-report.daily-comparison"].create = false;
    expect((await route.PUT(save({ date, revision: null, amounts: [] }))).status).toBe(403);
    mocks.user.mockResolvedValue({ id: userA, name: "Owner", role: "OWNER", storeId: storeA });
    expect((await route.GET(read(`date=${date}&view=sales`))).status).toBe(403);
    permissions.SALES.resources["financial-report.daily-comparison"].read = true;
    expect((await route.GET(read(`date=${date}&view=sales`))).status).toBe(200);
    expect((await route.PUT(save({ date, revision: null, amounts: [] }, "?view=sales"))).status).toBe(403);
  });

  it("permits only one concurrent creation and rejects stale updates", async () => {
    expect(route).not.toBeNull(); if (!route) return;
    const initial = { date, revision: null, amounts: [{ method: "CASH", amount: "1.00" }] };
    const created = await Promise.all([route.PUT(save(initial)), route.PUT(save(initial))]);
    expect(created.map(item => item.status).sort()).toEqual([200, 409]);
    const updates = await Promise.all([
      route.PUT(save({ date, revision: 1, amounts: [{ method: "CASH", amount: "2.00" }] })),
      route.PUT(save({ date, revision: 1, amounts: [{ method: "CASH", amount: "3.00" }] })),
    ]);
    expect(updates.map(item => item.status).sort()).toEqual([200, 409]);
    const comparison = (await (await route.GET(read())).json()).comparison;
    expect(comparison.revision).toBe(2);
    expect(["2.00", "3.00"]).toContain(comparison.amounts[0].amount);
  });
});
