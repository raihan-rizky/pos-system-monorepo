import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const inventoryTaskUpsertMock = vi.hoisted(() => vi.fn());
const inventoryTaskFindUniqueMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    inventoryTask: { upsert: inventoryTaskUpsertMock, findUnique: inventoryTaskFindUniqueMock },
  },
}));

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/inventory-management/weekly-cleaning-proof", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/inventory-management/weekly-cleaning-proof", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: "store-main",
    });
    inventoryTaskUpsertMock.mockResolvedValue({
      id: "task-1",
      type: "WEEKLY_CLEANING_PROOF",
      status: "SUBMITTED",
      periodKey: "2026-W26",
    });
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://pub-example.r2.dev");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          '<meta property="og:image" content="https://image.prntscr.com/image/proof.png">',
          { status: 200 },
        ),
      ),
    );
  });

  it("accepts a proof from the configured R2 public origin without fetching it", async () => {
    const proofUrl =
      "https://pub-example.r2.dev/proofs/weekly-cleaning/store-main/proof.jpg";

    const response = await post({
      proofUrl,
      now: "2026-06-25T08:00:00.000Z",
    });

    expect(response.status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
    expect(inventoryTaskUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          proofUrl,
          resolvedProofImageUrl: proofUrl,
        }),
      }),
    );
  });

  it("rejects a lookalike R2 origin", async () => {
    const response = await post({
      proofUrl: "https://pub-example.r2.dev.evil.test/proof.jpg",
      now: "2026-06-25T08:00:00.000Z",
    });

    expect(response.status).toBe(422);
    expect(inventoryTaskUpsertMock).not.toHaveBeenCalled();
  });

  it("resolves a prnt.sc proof URL and submits the weekly cleaning task", async () => {
    const response = await post({
      proofUrl: "https://prnt.sc/abc123",
      note: "Gudang sudah dibersihkan",
      now: "2026-06-25T08:00:00.000Z",
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
    expect(fetch).toHaveBeenCalledWith(
      "https://prnt.sc/abc123",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": expect.stringContaining("Mozilla"),
        }),
      }),
    );
    expect(inventoryTaskUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId_type_periodKey: {
            storeId: "store-main",
            type: "WEEKLY_CLEANING_PROOF",
            periodKey: "2026-W26",
          },
        },
        create: expect.objectContaining({
          storeId: "store-main",
          type: "WEEKLY_CLEANING_PROOF",
          periodType: "WEEKLY",
          periodKey: "2026-W26",
          status: "SUBMITTED",
          proofUrl: "https://prnt.sc/abc123",
          resolvedProofImageUrl: "https://image.prntscr.com/image/proof.png",
          submittedBy: "inventory-1",
        }),
        update: expect.objectContaining({
          status: "SUBMITTED",
          proofUrl: "https://prnt.sc/abc123",
          resolvedProofImageUrl: "https://image.prntscr.com/image/proof.png",
          submittedBy: "inventory-1",
        }),
      }),
    );
    expect(body.data.periodKey).toBe("2026-W26");
  });

  it("rejects proof when prnt.sc cannot resolve an image", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("<html>missing image</html>", { status: 200 }),
    );

    const response = await post({
      proofUrl: "https://prnt.sc/missing",
      now: "2026-06-25T08:00:00.000Z",
    });

    expect(response.status).toBe(422);
    expect(inventoryTaskUpsertMock).not.toHaveBeenCalled();
  });

  it("rejects users without a store scope", async () => {
    requirePermissionMock.mockResolvedValue({
      id: "inventory-1",
      role: "INVENTORY",
      storeId: null,
    });

    const response = await post({
      proofUrl: "https://prnt.sc/abc123",
      now: "2026-06-25T08:00:00.000Z",
    });

    expect(response.status).toBe(403);
    expect(inventoryTaskUpsertMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/inventory-management/weekly-cleaning-proof", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({ id: "owner-1", storeId: "store-main" });
    inventoryTaskFindUniqueMock.mockResolvedValue({ id: "task-1", proofUrl: "https://prnt.sc/abc", note: "Bersih" });
  });
  it("returns the current week's stored proof for deletion", async () => {
    const response = await GET(new Request("http://localhost/api/inventory-management/weekly-cleaning-proof"));
    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "read");
    expect((await response.json()).data).toMatchObject({ id: "task-1", proofUrl: "https://prnt.sc/abc" });
  });
});
