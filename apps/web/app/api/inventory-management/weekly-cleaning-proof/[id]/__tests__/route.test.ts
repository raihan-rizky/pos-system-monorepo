import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "../route";
const requirePermission = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const removeAsset = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rbac/guard", () => ({ requirePermission, handleAuthError: vi.fn(() => null) }));
vi.mock("@pos/db", () => ({ db: { inventoryTask: { findFirst, update } } }));
vi.mock("@/features/proof-upload/server/remove-stored-proof", () => ({ removeStoredProofAsset: removeAsset }));
describe("DELETE weekly proof", () => {
  beforeEach(() => {
    vi.clearAllMocks(); requirePermission.mockResolvedValue({ id: "owner-1", storeId: "store-main" });
    findFirst.mockResolvedValue({ id: "task-1", proofUrl: "https://prnt.sc/abc" });
    removeAsset.mockResolvedValue({ storage: "legacy" }); update.mockResolvedValue({ id: "task-1" });
  });
  it("keeps the task and clears both proof references", async () => {
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "task-1" }) });
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { proofUrl: null, resolvedProofImageUrl: null } }));
  });
});
