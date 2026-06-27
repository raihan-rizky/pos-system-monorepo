import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InventoryManagementError,
  createInternalStockOutRequest,
  approveInternalStockOutRequest,
  rejectInternalStockOutRequest,
} from "../internal-stock-out-service";
import type { InternalStockOutRepository } from "../../types/inventory-management";

describe("createInternalStockOutRequest", () => {
  let mockRepository: InternalStockOutRepository;

  beforeEach(() => {
    mockRepository = {
      createRequest: vi.fn(),
      approveRequest: vi.fn(),
      rejectRequest: vi.fn(),
    } as any;
  });

  it("requires storeId from user", async () => {
    const user = { id: "user-1", role: "CASHIER" as const, storeId: null };

    await expect(
      createInternalStockOutRequest({
        repository: mockRepository,
        user,
        input: {
          productId: "product-1",
          quantity: 5,
          reason: "Rusak",
        },
      }),
    ).rejects.toThrow(InventoryManagementError);
  });

  it("requires non-empty reason", async () => {
    const user = { id: "user-1", role: "CASHIER" as const, storeId: "store-main", name: "Staff A" };

    await expect(
      createInternalStockOutRequest({
        repository: mockRepository,
        user,
        input: {
          productId: "product-1",
          quantity: 5,
          reason: "   ",
        },
      }),
    ).rejects.toThrow("Reason is required");
  });

  it("requires positive quantity", async () => {
    const user = { id: "user-1", role: "CASHIER" as const, storeId: "store-main", name: "Staff A" };

    await expect(
      createInternalStockOutRequest({
        repository: mockRepository,
        user,
        input: {
          productId: "product-1",
          quantity: 0,
          reason: "Rusak",
        },
      }),
    ).rejects.toThrow("Quantity must be positive");
  });

  it("creates PENDING request with requester info", async () => {
    const user = { id: "user-1", role: "CASHIER" as const, storeId: "store-main", name: "Staff A" };
    vi.mocked(mockRepository.createRequest).mockResolvedValueOnce({
      id: "request-1",
      status: "PENDING",
    });

    const result = await createInternalStockOutRequest({
      repository: mockRepository,
      user,
      input: {
        productId: "product-1",
        quantity: 5,
        reason: "Rusak",
      },
    });

    expect(mockRepository.createRequest).toHaveBeenCalledWith({
      storeId: "store-main",
      productId: "product-1",
      quantity: 5,
      reason: "Rusak",
      requestedBy: "user-1",
      requestedByName: "Staff A",
      requestedByRole: "CASHIER",
    });
    expect(result).toEqual({ id: "request-1", status: "PENDING" });
  });
});

describe("approveInternalStockOutRequest", () => {
  let mockRepository: InternalStockOutRepository;

  beforeEach(() => {
    mockRepository = {
      createRequest: vi.fn(),
      approveRequest: vi.fn(),
      rejectRequest: vi.fn(),
      runInTransaction: vi.fn((cb) => cb({})),
    } as any;
  });

  it("requires storeId from owner", async () => {
    const user = { id: "owner-1", role: "OWNER" as const, storeId: null, name: "Owner A" };

    await expect(
      approveInternalStockOutRequest({
        repository: mockRepository,
        user,
        requestId: "request-1",
      }),
    ).rejects.toThrow(InventoryManagementError);
  });

  it("approves PENDING request and reduces stock in transaction", async () => {
    const user = { id: "owner-1", role: "OWNER" as const, storeId: "store-main", name: "Owner A" };
    vi.mocked(mockRepository.approveRequest).mockResolvedValueOnce({
      id: "request-1",
      status: "APPROVED",
    });

    const result = await approveInternalStockOutRequest({
      repository: mockRepository,
      user,
      requestId: "request-1",
    });

    expect(mockRepository.runInTransaction).toHaveBeenCalled();
    expect(mockRepository.approveRequest).toHaveBeenCalledWith(
      {},
      {
        storeId: "store-main",
        requestId: "request-1",
        approvedBy: "owner-1",
        approvedByName: "Owner A",
      },
    );
    expect(result).toEqual({ id: "request-1", status: "APPROVED" });
  });
});

describe("rejectInternalStockOutRequest", () => {
  let mockRepository: InternalStockOutRepository;

  beforeEach(() => {
    mockRepository = {
      createRequest: vi.fn(),
      approveRequest: vi.fn(),
      rejectRequest: vi.fn(),
    } as any;
  });

  it("requires non-empty rejection reason", async () => {
    const user = { id: "owner-1", role: "OWNER" as const, storeId: "store-main", name: "Owner A" };

    await expect(
      rejectInternalStockOutRequest({
        repository: mockRepository,
        user,
        requestId: "request-1",
        rejectionReason: "  ",
      }),
    ).rejects.toThrow("Rejection reason is required");
  });

  it("rejects PENDING request with reason", async () => {
    const user = { id: "owner-1", role: "OWNER" as const, storeId: "store-main", name: "Owner A" };
    vi.mocked(mockRepository.rejectRequest).mockResolvedValueOnce({
      id: "request-1",
      status: "REJECTED",
    });

    const result = await rejectInternalStockOutRequest({
      repository: mockRepository,
      user,
      requestId: "request-1",
      rejectionReason: "Stock tidak cukup",
    });

    expect(mockRepository.rejectRequest).toHaveBeenCalledWith({
      storeId: "store-main",
      requestId: "request-1",
      rejectedBy: "owner-1",
      rejectedByName: "Owner A",
      rejectionReason: "Stock tidak cukup",
    });
    expect(result).toEqual({ id: "request-1", status: "REJECTED" });
  });
});
