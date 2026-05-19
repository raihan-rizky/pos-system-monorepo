import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@pos/db";
import { NextRequest } from "next/server";
import { GET } from "../route";

// Mock the RBAC guard
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: vi.fn(async () => ({
    id: "test-user-1",
    name: "Test User",
    storeId: "store-main",
  })),
  handleAuthError: vi.fn(() => null),
}));

describe.skip("GET /api/inventory/logs - Person Field", () => {
  let testProduct: any;
  let testStore: any;
  let testUser: any;

  beforeAll(async () => {
    // Create test store
    testStore = await db.store.create({
      data: {
        name: "Test Store",
        address: "123 Test St",
      },
    });

    // Create test user
    testUser = await db.user.create({
      data: {
        username: "testuser",
        name: "John Doe",
        storeId: testStore.id,
      },
    });

    // Create test category
    const category = await db.category.create({
      data: {
        name: "Test Category",
      },
    });

    // Create test product
    testProduct = await db.product.create({
      data: {
        name: "Test Product",
        sku: "TEST-001",
        price: 10000,
        storeId: testStore.id,
        categoryId: category.id,
      },
    });
  });

  afterAll(async () => {
    // Cleanup
    await db.inventoryLog.deleteMany({});
    await db.product.deleteMany({});
    await db.category.deleteMany({});
    await db.user.deleteMany({});
    await db.store.deleteMany({});
  });

  it("should include person field in inventory logs", async () => {
    // Create inventory log with person field
    const log = await db.inventoryLog.create({
      data: {
        productId: testProduct.id,
        type: "IN",
        quantity: 10,
        note: "Stock in test",
        createdBy: testUser.id,
        person: testUser.name,
      },
    });

    expect(log.person).toBe("John Doe");
    expect(log.createdBy).toBe(testUser.id);
  });

  it("should return person field in API response", async () => {
    // Create inventory log
    await db.inventoryLog.create({
      data: {
        productId: testProduct.id,
        type: "OUT",
        quantity: 5,
        note: "Stock out test",
        createdBy: testUser.id,
        person: testUser.name,
      },
    });

    // Create mock request
    const request = new NextRequest(
      new URL("http://localhost:3000/api/inventory/logs")
    );

    // Call API
    const response = await GET(request);
    const data = await response.json();

    // Verify person field is in response
    expect(data.logs).toBeDefined();
    expect(data.logs.length).toBeGreaterThan(0);
    expect(data.logs[0]).toHaveProperty("person");
    expect(data.logs[0].person).toBe("John Doe");
  });

  it("should handle null person field gracefully", async () => {
    // Create inventory log without person
    const log = await db.inventoryLog.create({
      data: {
        productId: testProduct.id,
        type: "ADJUSTMENT",
        quantity: 2,
        note: "Adjustment test",
        createdBy: testUser.id,
        person: null,
      },
    });

    expect(log.person).toBeNull();
  });
});
