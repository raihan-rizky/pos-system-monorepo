import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const suratJalanFindFirstMock = vi.hoisted(() => vi.fn());
const suratJalanUpdateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    suratJalan: {
      findFirst: suratJalanFindFirstMock,
      update: suratJalanUpdateMock,
    },
  },
}));

function post(body: unknown) {
  return import("../route").then(({ POST }) =>
    POST(
      new Request("http://localhost/api/surat-jalan/sj-1/marking", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "sj-1" }) },
    ),
  );
}

describe("POST /api/surat-jalan/[id]/marking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      username: "inventory",
      name: "Inventory Staff",
      storeId: "store-main",
    });
    suratJalanFindFirstMock.mockResolvedValue({ id: "sj-1" });
    suratJalanUpdateMock.mockImplementation(async ({ data }) => ({
      id: "sj-1",
      number: "TLD-28062026-001",
      status: "CONFIRMED",
      ...data,
      items: [],
    }));
  });

  it("marks surat jalan as completed without requiring a note", async () => {
    const response = await post({ markingStatus: "COMPLETED" });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.markingStatus).toBe("COMPLETED");
    expect(suratJalanUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sj-1" },
        data: expect.objectContaining({
          markingStatus: "COMPLETED",
          markedById: "inventory-1",
          markedByName: "Inventory Staff",
          markingNote: null,
        }),
      }),
    );
  });

  it("requires a note for exception marking statuses", async () => {
    const response = await post({ markingStatus: "NEEDS_SIGNATURE" });
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.errors.markingNote).toContain("Catatan wajib diisi untuk status ini");
    expect(suratJalanUpdateMock).not.toHaveBeenCalled();
  });

  it("stores exception marking with note", async () => {
    const response = await post({
      markingStatus: "NOT_DELIVERED",
      markingNote: "Kurir belum ambil barang.",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.markingStatus).toBe("NOT_DELIVERED");
    expect(suratJalanUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          markingStatus: "NOT_DELIVERED",
          markingNote: "Kurir belum ambil barang.",
        }),
      }),
    );
  });
});
