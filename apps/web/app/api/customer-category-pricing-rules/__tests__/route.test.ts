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

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
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
  beforeEach(() => {
    vi.clearAllMocks();
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
    ruleFindFirstMock.mockResolvedValue({ id: "existing-rule" });

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
    expect(ruleFindFirstMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-main",
          categoryId: "cat-1",
          customerType: null,
          unit: "rim",
          brandId: "brand-1",
          isActive: true,
        }),
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
