import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const findManyMock = vi.hoisted(() => vi.fn());
const countMock = vi.hoisted(() => vi.fn());
const findFirstMock = vi.hoisted(() => vi.fn());
const createMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    printingService: {
      findMany: findManyMock,
      count: countMock,
      findFirst: findFirstMock,
      create: createMock,
    },
  },
  Prisma: {},
}));

describe("/api/printing-services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Admin",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    findManyMock.mockResolvedValue([]);
    countMock.mockResolvedValue(0);
    findFirstMock.mockResolvedValue(null);
    createMock.mockResolvedValue({
      id: "service-1",
      storeId: "store-main",
      name: "X Banner",
      basePrice: "50000.00",
      unit: "pcs",
      description: null,
      isActive: true,
    });
  });

  it("lists services as a paginated resource", async () => {
    findManyMock.mockResolvedValue([
      {
        id: "service-1",
        storeId: "store-main",
        name: "X Banner",
        basePrice: "50000.00",
        unit: "pcs",
        description: null,
        isActive: true,
      },
    ]);
    countMock.mockResolvedValue(1);

    const response = await GET(
      new NextRequest("http://localhost/api/printing-services?search=banner&page=2&limit=10"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("product", "read");
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-main",
          isActive: true,
          OR: [
            { name: { contains: "banner", mode: "insensitive" } },
            { description: { contains: "banner", mode: "insensitive" } },
          ],
        }),
        orderBy: { name: "asc" },
        skip: 10,
        take: 10,
      }),
    );
    expect(body.pagination).toEqual({
      total: 1,
      page: 2,
      limit: 10,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: true,
    });
  });

  it("creates a service with product update permission", async () => {
    const response = await POST(
      new Request("http://localhost/api/printing-services", {
        method: "POST",
        body: JSON.stringify({
          name: "X Banner",
          basePrice: 50000,
          unit: "pcs",
          description: "Standing banner",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(requirePermissionMock).toHaveBeenCalledWith("product", "update");
    expect(createMock).toHaveBeenCalledWith({
      data: {
        storeId: "store-main",
        name: "X Banner",
        basePrice: 50000,
        unit: "pcs",
        description: "Standing banner",
        isActive: true,
      },
    });
    expect(body.name).toBe("X Banner");
  });

  it("rejects duplicate active service names in the same store", async () => {
    findFirstMock.mockResolvedValue({ id: "existing" });

    const response = await POST(
      new Request("http://localhost/api/printing-services", {
        method: "POST",
        body: JSON.stringify({
          name: "X Banner",
          basePrice: 50000,
          unit: "pcs",
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(createMock).not.toHaveBeenCalled();
  });
});
