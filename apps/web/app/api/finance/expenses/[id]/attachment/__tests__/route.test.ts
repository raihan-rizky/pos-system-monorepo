import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "../route";

const requirePermission = vi.hoisted(() => vi.fn());
const findFirst = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
const removeAsset = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rbac/guard", () => ({ requirePermission, handleAuthError: vi.fn(() => null) }));
vi.mock("@pos/db", () => ({ db: { expense: { findFirst, update } } }));
vi.mock("@/features/proof-upload/server/remove-stored-proof", () => ({ removeStoredProofAsset: removeAsset }));

describe("DELETE expense attachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermission.mockResolvedValue({ id: "owner-1", storeId: "store-main" });
    findFirst.mockResolvedValue({ id: "expense-1", attachmentUrl: "https://prnt.sc/abc", deletedAt: null });
    removeAsset.mockResolvedValue({ storage: "legacy" });
    update.mockResolvedValue({ id: "expense-1", attachmentUrl: null });
  });
  it("clears the stored attachment without deleting the expense", async () => {
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "expense-1" }) });
    expect(response.status).toBe(200);
    expect(requirePermission).toHaveBeenCalledWith("proof_upload", "delete");
    expect(removeAsset).toHaveBeenCalledWith("https://prnt.sc/abc");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { attachmentUrl: null } }));
  });
  it("reports a database reference failure as 500 after storage deletion", async () => {
    update.mockRejectedValue(new Error("database unavailable"));
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), { params: Promise.resolve({ id: "expense-1" }) });
    expect(response.status).toBe(500);
  });
  it("does not mutate attachments on automatic shopping-request expenses", async () => {
    findFirst.mockResolvedValueOnce({
      id: "expense-1",
      attachmentUrl: "https://prnt.sc/abc",
      deletedAt: null,
      shoppingRequestId: "request-1",
    });

    const response = await DELETE(
      new Request("http://localhost", { method: "DELETE" }),
      { params: Promise.resolve({ id: "expense-1" }) },
    );

    expect(response.status).toBe(409);
    expect(removeAsset).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
