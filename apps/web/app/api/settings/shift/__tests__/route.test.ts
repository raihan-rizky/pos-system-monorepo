import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "../route";

const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const getShiftSettingsMock = vi.hoisted(() => vi.fn());
const setShiftEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/shift/shift-settings-server", () => ({
  getShiftSettings: getShiftSettingsMock,
  setShiftEnabled: setShiftEnabledMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ error: vi.fn() }),
}));

function makeJsonRequest(body: unknown) {
  return new Request("http://localhost/api/settings/shift", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/settings/shift", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    getShiftSettingsMock.mockResolvedValue({ enabled: true });
    setShiftEnabledMock.mockResolvedValue({ enabled: false });
  });

  it("returns the current setting to an authenticated POS role", async () => {
    requireRoleMock.mockResolvedValue({ role: "CASHIER" });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ enabled: true });
    expect(requireRoleMock).toHaveBeenCalledWith(
      "OWNER",
      "ADMIN",
      "CASHIER",
      "SALES",
      "INVENTORY",
    );
  });

  it("allows OWNER to disable shift mode", async () => {
    requireRoleMock.mockResolvedValue({ role: "OWNER" });

    const response = await PATCH(makeJsonRequest({ enabled: false }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ enabled: false });
    expect(setShiftEnabledMock).toHaveBeenCalledWith(false);
  });

  it("rejects malformed enabled values", async () => {
    requireRoleMock.mockResolvedValue({ role: "OWNER" });

    const response = await PATCH(makeJsonRequest({ enabled: "false" }));

    expect(response.status).toBe(422);
    expect(setShiftEnabledMock).not.toHaveBeenCalled();
  });

  it("returns auth errors for a non-owner mutation", async () => {
    const authResponse = Response.json(
      { message: "Insufficient permissions" },
      { status: 403 },
    );
    requireRoleMock.mockRejectedValue(new Error("Insufficient permissions"));
    handleAuthErrorMock.mockReturnValue(authResponse);

    const response = await PATCH(makeJsonRequest({ enabled: false }));

    expect(response.status).toBe(403);
    expect(setShiftEnabledMock).not.toHaveBeenCalled();
  });
});
