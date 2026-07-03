import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const brandFindManyMock = vi.hoisted(() => vi.fn());
const brandFindFirstMock = vi.hoisted(() => vi.fn());
const brandCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    brand: {
      findMany: brandFindManyMock,
      findFirst: brandFindFirstMock,
      create: brandCreateMock,
    },
  },
}));

describe("/api/brands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      role: "OWNER",
      storeId: "store-main",
    });
    handleAuthErrorMock.mockReturnValue(null);
    brandFindManyMock.mockResolvedValue([]);
    brandFindFirstMock.mockResolvedValue(null);
    brandCreateMock.mockImplementation(async ({ data }) => ({
      id: "brand-1",
      ...data,
      createdAt: new Date("2026-07-03T00:00:00.000Z"),
      updatedAt: new Date("2026-07-03T00:00:00.000Z"),
    }));
  });

  it("lists brands for the current store ordered by name", async () => {
    brandFindManyMock.mockResolvedValue([
      {
        id: "brand-1",
        storeId: "store-main",
        name: "Joyko",
        normalizedName: "joyko",
        createdAt: new Date("2026-07-03T00:00:00.000Z"),
        updatedAt: new Date("2026-07-03T00:00:00.000Z"),
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("product", "read");
    expect(brandFindManyMock).toHaveBeenCalledWith({
      where: { storeId: "store-main" },
      orderBy: { name: "asc" },
    });
    expect(body.data[0]).toEqual(
      expect.objectContaining({
        id: "brand-1",
        name: "Joyko",
        normalizedName: "joyko",
      }),
    );
  });

  it("creates a brand with normalized duplicate prevention", async () => {
    const response = await POST(
      new Request("http://localhost/api/brands", {
        method: "POST",
        body: JSON.stringify({ name: " Joyko " }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(requirePermissionMock).toHaveBeenCalledWith("product", "update");
    expect(brandFindFirstMock).toHaveBeenCalledWith({
      where: { storeId: "store-main", normalizedName: "joyko" },
      select: { id: true },
    });
    expect(brandCreateMock).toHaveBeenCalledWith({
      data: {
        storeId: "store-main",
        name: "Joyko",
        normalizedName: "joyko",
      },
    });
    expect(body.name).toBe("Joyko");
  });

  it("rejects duplicate brand names after normalization", async () => {
    brandFindFirstMock.mockResolvedValue({ id: "existing-brand" });

    const response = await POST(
      new Request("http://localhost/api/brands", {
        method: "POST",
        body: JSON.stringify({ name: "JOYKO" }),
      }),
    );

    expect(response.status).toBe(409);
    expect(brandCreateMock).not.toHaveBeenCalled();
  });
});
