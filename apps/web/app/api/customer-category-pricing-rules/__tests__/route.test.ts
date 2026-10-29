import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const ruleFindManyMock = vi.hoisted(() => vi.fn());
const ruleFindFirstMock = vi.hoisted(() => vi.fn());
const ruleCreateMock = vi.hoisted(() => vi.fn());
const categoryFindUniqueMock = vi.hoisted(() => vi.fn());
const brandFindUniqueMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const lockMock = vi.hoisted(() => vi.fn());
const testDb = vi.hoisted(() => ({
  categoryCustomerPricingRule: { findMany: ruleFindManyMock, findFirst: ruleFindFirstMock, create: ruleCreateMock },
  category: { findUnique: categoryFindUniqueMock },
  brand: { findUnique: brandFindUniqueMock },
  $queryRaw: lockMock,
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    $transaction: transactionMock,
    categoryCustomerPricingRule: {
      findMany: ruleFindManyMock,
      findFirst: ruleFindFirstMock,
      create: ruleCreateMock,
    },
    category: {
      findUnique: categoryFindUniqueMock,
    },
    brand: {
      findUnique: brandFindUniqueMock,
    },
  },
}));

describe("/api/customer-category-pricing-rules", () => {
  it("stores normalized, distinct selected units on one rule", async () => {
    const response = await POST(new Request("http://localhost/api/customer-category-pricing-rules", {
      method: "POST", body: JSON.stringify({ categoryId: "cat-1", customerTypes: ["AGEN"], units: [" Rim ", "box", "rim"], mode: "FLAT_DISCOUNT", value: 500 }),
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ unit: null, units: ["rim", "box"] });
    expect(ruleCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unit: null, units: ["rim", "box"] }) }));
  });

  it("rejects a rule when any selected unit overlaps an existing rule for the same customers", async () => {
    ruleFindManyMock.mockResolvedValue([{ id: "other", customerTypes: ["AGEN"], customerType: "AGEN", unit: null, units: ["box", "pcs"] }]);
    const response = await POST(new Request("http://localhost/api/customer-category-pricing-rules", {
      method: "POST", body: JSON.stringify({ categoryId: "cat-1", customerTypes: ["AGEN"], units: ["rim", "box"], mode: "FLAT_DISCOUNT", value: 500 }),
    }));
    expect(response.status).toBe(409);
    expect(ruleCreateMock).not.toHaveBeenCalled();
  });

  it("persists both percentages of the selected-unit modal formula", async () => {
    const response = await POST(new Request("http://localhost/api/customer-category-pricing-rules", {
      method: "POST", body: JSON.stringify({ categoryId: "cat-1", customerTypes: ["ALL"], unit: "dus", mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT", value: 10, discountPercent: 5 }),
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ value: 10, discountPercent: 5 });
    expect(ruleCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ discountPercent: 5 }) }));
  });
  it.each(["COST_PLUS_FLAT", "COST_PLUS_PERCENT"])("creates %s for all category units", async (mode) => {
    const response = await POST(new Request("http://localhost/api/customer-category-pricing-rules", {
      method: "POST",
      body: JSON.stringify({ categoryId: "cat-1", customerTypes: ["UMUM"], unit: null, mode, value: 10 }),
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ unit: null, mode });
    expect(ruleCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ unit: null, categoryId: "cat-1" }) }));
  });
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (callback) => callback(testDb));
    lockMock.mockResolvedValue([]);
    requirePermissionMock.mockResolvedValue({
      id: "cashier-1",
      role: "CASHIER",
      storeId: "store-main",
    });
    requireRoleMock.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    ruleFindManyMock.mockResolvedValue([]);
    ruleFindFirstMock.mockResolvedValue(null);
    ruleCreateMock.mockImplementation(async ({ data }) => ({
      id: "rule-1",
      ...data,
      createdAt: new Date("2026-06-03T00:00:00.000Z"),
      updatedAt: new Date("2026-06-03T00:00:00.000Z"),
      category: { id: data.categoryId, name: "Kertas", icon: null, color: null },
    }));
    categoryFindUniqueMock.mockResolvedValue({ id: "cat-1" });
    brandFindUniqueMock.mockResolvedValue({ id: "brand-1", storeId: "store-main" });
  });

  it("stores a single formula rule for multiple customer types", async () => {
    const response = await POST(new Request("http://localhost/api/customer-category-pricing-rules", {
      method: "POST", body: JSON.stringify({ categoryId: "cat-1", customerTypes: ["UMUM", "AGEN"], unit: "Rim", mode: "COST_PLUS_FLAT", value: 4000 }),
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ customerTypes: ["UMUM", "AGEN"], unit: "rim", mode: "COST_PLUS_FLAT" });
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(lockMock).toHaveBeenCalledTimes(1);
    expect(ruleCreateMock).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ customerTypes: ["UMUM", "AGEN"] }) }));
  });

  it("saves when the database lock returns a Prisma-supported type", async () => {
    lockMock.mockImplementation((strings: TemplateStringsArray) => {
      if (!strings.join("").includes("::text")) throw new Error("Failed to deserialize column of type 'void'");
      return Promise.resolve([{ pg_advisory_xact_lock: "" }]);
    });
    const response = await POST(new Request("http://localhost/api/customer-category-pricing-rules", {
      method: "POST", body: JSON.stringify({ categoryId: "cat-1", customerTypes: ["UMUM"], unit: "rim", mode: "COST_PLUS_FLAT", value: 4000 }),
    }));
    expect(response.status).toBe(201);
  });

  it("gives creation enough time for a remote database transaction", async () => {
    transactionMock.mockImplementation((callback, options) => {
      if (!options || options.timeout < 15000) throw new Error("Transaction expired after Prisma's default 5000ms");
      return callback(testDb);
    });
    const response = await POST(new Request("http://localhost/api/customer-category-pricing-rules", {
      method: "POST", body: JSON.stringify({ categoryId: "cat-1", customerTypes: ["UMUM"], unit: "rim", mode: "COST_PLUS_FLAT", value: 4000 }),
    }));
    expect(response.status).toBe(201);
  });

  it("rejects overlapping explicit targets inside the locked transaction", async () => {
    ruleFindManyMock.mockResolvedValue([{ id: "other", customerTypes: ["AGEN", "INDUSTRI"], customerType: null, unit: "rim", units: ["rim"] }]);
    const response = await POST(new Request("http://localhost/api/customer-category-pricing-rules", {
      method: "POST", body: JSON.stringify({ categoryId: "cat-1", customerTypes: ["UMUM", "AGEN"], unit: "rim", mode: "COST_PLUS_FLAT", value: 4000 }),
    }));
    expect(response.status).toBe(409);
    expect(lockMock.mock.invocationCallOrder[0]).toBeLessThan(ruleFindManyMock.mock.invocationCallOrder[0]);
    expect(ruleCreateMock).not.toHaveBeenCalled();
  });

  it("allows ALL fallback alongside explicit targets", async () => {
    ruleFindManyMock.mockResolvedValue([{ id: "all", customerTypes: [], customerType: null, unit: "rim", units: ["rim"] }]);
    const response = await POST(new Request("http://localhost/api/customer-category-pricing-rules", {
      method: "POST", body: JSON.stringify({ categoryId: "cat-1", customerTypes: ["AGEN"], unit: "rim", mode: "COST_PLUS_PERCENT", value: 150 }),
    }));
    expect(response.status).toBe(201);
  });

  it.each(["COST_PLUS_FLAT", "COST_PLUS_PERCENT"])("allows modal with zero addition for %s", async (mode) => {
    const response = await POST(new Request("http://localhost/api/customer-category-pricing-rules", {
      method: "POST", body: JSON.stringify({ categoryId: "cat-1", customerTypes: ["AGEN"], unit: "rim", mode, value: 0 }),
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ mode, value: 0 });
  });

  it.each([
    { customerTypes: ["ALL", "AGEN"] },
    { customerTypes: [] },
    { customerTypes: ["UMUM"], customerType: "AGEN" },
    { customerTypes: ["AGEN"], value: -1 },
    { customerTypes: ["AGEN"], value: "Infinity" },
  ])("rejects invalid formula input %j", async (invalid) => {
    const response = await POST(new Request("http://localhost/api/customer-category-pricing-rules", {
      method: "POST", body: JSON.stringify({ categoryId: "cat-1", unit: "rim", mode: "COST_PLUS_FLAT", value: 4000, ...invalid }),
    }));
    expect(response.status).toBe(422);
    expect(ruleCreateMock).not.toHaveBeenCalled();
  });

  it("allows checkout roles to read active rules", async () => {
    const response = await GET(
      new Request("http://localhost/api/customer-category-pricing-rules?activeOnly=true"),
    );

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("product", "read");
    expect(ruleFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-main",
          isActive: true,
        }),
      }),
    );
  });

  it("requires OWNER to create rules", async () => {
    const response = await POST(
      new Request("http://localhost/api/customer-category-pricing-rules", {
        method: "POST",
        body: JSON.stringify({
          categoryId: "cat-1",
          customerType: "AGEN",
          mode: "PERCENT_DISCOUNT",
          value: 10,
        }),
      }),
    );

    expect(response.status).toBe(201);
    expect(requireRoleMock).toHaveBeenCalledWith("OWNER");
  });

  it("rejects duplicate active customer type and category rules", async () => {
    ruleFindManyMock.mockResolvedValue([{ id: "existing-rule", customerType: "AGEN", customerTypes: ["AGEN"] }]);

    const response = await POST(
      new Request("http://localhost/api/customer-category-pricing-rules", {
        method: "POST",
        body: JSON.stringify({
          categoryId: "cat-1",
          customerType: "AGEN",
          mode: "FLAT_DISCOUNT",
          value: 8000,
        }),
      }),
    );

    expect(response.status).toBe(409);
  });

  it("rejects zero flat discounts", async () => {
    const response = await POST(
      new Request("http://localhost/api/customer-category-pricing-rules", {
        method: "POST",
        body: JSON.stringify({
          categoryId: "cat-1",
          customerType: "AGEN",
          mode: "FLAT_DISCOUNT",
          value: 0,
        }),
      }),
    );

    expect(response.status).toBe(422);
  });

  it("creates ALL customer rules scoped by unit and brand", async () => {
    const response = await POST(
      new Request("http://localhost/api/customer-category-pricing-rules", {
        method: "POST",
        body: JSON.stringify({
          categoryId: "cat-1",
          customerType: "ALL",
          mode: "PERCENT_DISCOUNT",
          value: 10,
          unit: " Rim ",
          brandId: "brand-1",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(ruleFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-main",
          categoryId: "cat-1",
          brandId: "brand-1",
          isActive: true,
        }),
        select: expect.objectContaining({ unit: true, units: true }),
      }),
    );
    expect(ruleCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: "store-main",
          categoryId: "cat-1",
          customerType: null,
          unit: "rim",
          brandId: "brand-1",
          mode: "PERCENT_DISCOUNT",
          value: 10,
        }),
      }),
    );
    expect(body.customerType).toBe("ALL");
    expect(body.unit).toBe("rim");
    expect(body.brandId).toBe("brand-1");
  });
});
