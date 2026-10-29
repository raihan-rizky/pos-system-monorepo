import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH, DELETE } from "../route";

const mocks = vi.hoisted(() => ({ role: vi.fn(), authError: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), category: vi.fn(), brand: vi.fn(), transaction: vi.fn(), lock: vi.fn() }));
const tx = vi.hoisted(() => ({ categoryCustomerPricingRule: { findFirst: mocks.findFirst, findMany: mocks.findMany, update: mocks.update }, category: { findUnique: mocks.category }, brand: { findUnique: mocks.brand }, $queryRaw: mocks.lock }));
vi.mock("@pos/db", () => ({ db: { ...tx, $transaction: mocks.transaction } }));
vi.mock("@/lib/rbac/guard", () => ({ requireRole: mocks.role, requirePermission: mocks.role, handleAuthError: mocks.authError }));

const existing = { id: "rule", storeId: "store", categoryId: "cat", customerType: "AGEN", customerTypes: ["AGEN"], unit: "rim", units: ["rim"], brandId: null, mode: "FLAT_DISCOUNT", value: 1000, isActive: true };
function request(body: unknown) { return new Request("http://localhost/api/customer-category-pricing-rules/rule", { method: "PATCH", body: JSON.stringify(body) }); }
const params = { params: Promise.resolve({ id: "rule" }) };

describe("pricing rule updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.role.mockResolvedValue({ id: "owner", storeId: "store" });
    mocks.authError.mockReturnValue(null);
    mocks.findFirst.mockResolvedValue(existing);
    mocks.findMany.mockResolvedValue([]);
    mocks.category.mockResolvedValue({ id: "cat" });
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.lock.mockResolvedValue([]);
    mocks.update.mockImplementation(({ data }) => Promise.resolve({ ...existing, ...data }));
  });
  it("updates several units and can later switch to all units", async () => {
    const selected = await PATCH(request({ units: ["rim", " BOX "] }), params);
    expect(selected.status).toBe(200);
    expect(await selected.json()).toMatchObject({ unit: null, units: ["rim", "box"] });
    mocks.findFirst.mockResolvedValue({ ...existing, unit: null, units: ["rim", "box"] });
    const all = await PATCH(request({ units: [] }), params);
    expect(all.status).toBe(200);
    expect(await all.json()).toMatchObject({ unit: null, units: [] });
  });
  it("updates targets and formula atomically", async () => {
    const response = await PATCH(request({ customerTypes: ["UMUM", "AGEN"], mode: "COST_PLUS_FLAT", value: 4000 }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ customerTypes: ["UMUM", "AGEN"], mode: "COST_PLUS_FLAT" });
    expect(mocks.lock).toHaveBeenCalledTimes(1);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.findFirst.mock.invocationCallOrder[0]);
  });
  it("edits only the second percentage while preserving modal markup and scope", async () => {
    mocks.findFirst.mockResolvedValue({ ...existing, mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT", value: 10, discountPercent: 5 });
    const response = await PATCH(request({ discountPercent: 20 }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT", value: 10, discountPercent: 20, unit: "rim", customerTypes: ["AGEN"] });
  });
  it("preserves a stored second percentage when changing only markup", async () => {
    mocks.findFirst.mockResolvedValue({ ...existing, mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT", value: 10, discountPercent: "5.5" });
    const response = await PATCH(request({ value: 35 }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ value: 35, discountPercent: 5.5 });
  });
  it("clears the second percentage when switching back to an existing formula", async () => {
    mocks.findFirst.mockResolvedValue({ ...existing, mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT", value: 10, discountPercent: 5 });
    const response = await PATCH(request({ mode: "COST_PLUS_PERCENT" }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ mode: "COST_PLUS_PERCENT", value: 10, discountPercent: 0 });
  });
  it("requires the second percentage when switching to the sequential formula", async () => {
    const response = await PATCH(request({ mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT", value: 10 }), params);
    expect(response.status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each([-1, 101, null, "5"])("rejects an invalid second percentage %j without saving", async (discountPercent) => {
    const response = await PATCH(request({ mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT", value: 10, discountPercent }), params);
    expect(response.status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it.each(["PATCH", "DELETE"])("gives %s enough time for a remote database transaction", async (method) => {
    mocks.transaction.mockImplementation((callback, options) => {
      if (!options || options.timeout < 15000) throw new Error("Transaction expired after Prisma's default 5000ms");
      return callback(tx);
    });
    const response = method === "PATCH"
      ? await PATCH(request({ value: 2000 }), params)
      : await DELETE(request({}), params);
    expect(response.status).toBe(method === "PATCH" ? 200 : 204);
  });
  it("rejects conflicts excluding the rule being edited", async () => {
    mocks.findMany.mockResolvedValue([{ id: "other", customerTypes: ["UMUM"], customerType: "UMUM", unit: "rim", units: ["rim"] }]);
    const response = await PATCH(request({ customerTypes: ["UMUM", "AGEN"] }), params);
    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { not: "rule" }, storeId: "store", categoryId: "cat", brandId: null }), select: expect.objectContaining({ unit: true, units: true }) }));
  });
  it.each(["COST_PLUS_FLAT", "COST_PLUS_PERCENT"])("switches %s to all units with a partial update", async (mode) => {
    mocks.findFirst.mockResolvedValue({ ...existing, mode, value: 4000 });
    const response = await PATCH(request({ unit: null }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ unit: null, mode, value: 4000 });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unit: null }) }));
  });
  it("locks before disabling a rule so concurrent edits remain ordered", async () => {
    const response = await DELETE(request({}), params);
    expect(response.status).toBe(204);
    expect(mocks.lock).toHaveBeenCalledTimes(1);
    expect(mocks.lock.mock.invocationCallOrder[0]).toBeLessThan(mocks.findFirst.mock.invocationCallOrder[0]);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "rule" }, data: { isActive: false, updatedBy: "owner" } });
  });
});
