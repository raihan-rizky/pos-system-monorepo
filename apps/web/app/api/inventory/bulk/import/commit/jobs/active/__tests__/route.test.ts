import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const permission = vi.hoisted(() => vi.fn());
const authError = vi.hoisted(() => vi.fn());
const activeJob = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({ requirePermission: permission, handleAuthError: authError }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/features/bulk-stock-import/services/bulk-stock-import-job-service", () => ({ getActiveBulkStockImportJob: activeJob }));

describe("GET active bulk stock import job", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    permission.mockResolvedValue({ id: "user-1", role: "ADMIN", storeId: "store-1" });
    authError.mockReturnValue(null);
  });

  it("returns the active job for the authenticated inventory user", async () => {
    activeJob.mockResolvedValue({ id: "job-1", status: "RUNNING", storeId: "store-1" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ job: { id: "job-1", status: "RUNNING", storeId: "store-1" } });
    expect(permission).toHaveBeenCalledWith("inventory", "update");
    expect(activeJob).toHaveBeenCalledWith({ id: "user-1", role: "ADMIN", storeId: "store-1" });
  });

  it("does not read jobs when inventory access is denied", async () => {
    permission.mockRejectedValue(new Error("forbidden"));
    authError.mockReturnValue(Response.json({ message: "Akses ditolak" }, { status: 403 }));
    const response = await GET();
    expect(response.status).toBe(403);
    expect(activeJob).not.toHaveBeenCalled();
  });
});
