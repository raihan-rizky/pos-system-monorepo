import { describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ db: { shoppingRequest: { findMany } } }));
import { listShoppingRequests } from "../shopping-requests-repository";

describe("metadata pembatalan daftar", () => {
  it("mengembalikan pelaku, alasan, dan waktu pembatalan untuk arsip", async () => {
    const createdAt = new Date("2026-11-01T00:00:00Z");
    findMany.mockResolvedValueOnce([{
      id: "request-1", number: "DPB-1", name: "Kertas", status: "CANCELLED",
      goodsPurchases: [], supplier: null, _count: { items: 0 }, items: [],
      supplierId: null, approvedById: null, createdAt, approvedAt: null, rejectedAt: null,
      stockAppliedAt: null, deletion: { actorName: "Rina", reason: "Salah catat", createdAt },
    }]);
    const rows = await listShoppingRequests({ storeId: "store-1", ids: ["request-1"], skip: 0, take: 1 });
    expect(findMany.mock.calls[0][0].include.deletion).toBeDefined();
    expect(rows[0].deletion).toEqual({ actorName: "Rina", reason: "Salah catat", createdAt: createdAt.toISOString() });
  });
});
