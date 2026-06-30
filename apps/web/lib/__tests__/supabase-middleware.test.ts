import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

const getUserMock = vi.hoisted(() => vi.fn());
const maybeSingleMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn(() => ({ maybeSingle: maybeSingleMock })));
const selectMock = vi.hoisted(() => vi.fn(() => ({ eq: eqMock })));
const fromMock = vi.hoisted(() => vi.fn(() => ({ select: selectMock })));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: getUserMock,
      signOut: vi.fn(),
    },
    from: fromMock,
  })),
}));

describe("updateSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({
      data: { user: { email: "admin@pos.local" } },
    });
    maybeSingleMock.mockResolvedValue({
      data: {
        id: "admin-1",
        name: "Admin User",
        role: "ADMIN",
        storeId: "store-1",
        isActive: true,
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refreshes POS identity cookies for the current Supabase user even when stale owner cookies exist", async () => {
    const request = new NextRequest("http://localhost/api/inventory", {
      headers: {
        cookie:
          "x-pos-role=OWNER; x-pos-user-id=owner-1; x-pos-user-name=Owner%20User",
      },
    });

    const response = await updateSession(request);

    expect(response.cookies.get("x-pos-role")?.value).toBe("ADMIN");
    expect(response.cookies.get("x-pos-user-id")?.value).toBe("admin-1");
    expect(response.cookies.get("x-pos-user-name")?.value).toBe("Admin User");
    expect(response.cookies.get("x-pos-store-id")?.value).toBe("store-1");
  });

  it("redirects page requests once when POS identity cookies are missing on first login", async () => {
    const request = new NextRequest("http://localhost/pos");

    const response = await updateSession(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/pos");
    expect(response.cookies.get("x-pos-role")?.value).toBe("ADMIN");
    expect(response.cookies.get("x-pos-user-id")?.value).toBe("admin-1");
    expect(response.cookies.get("x-pos-store-id")?.value).toBe("store-1");
  });

  it("fails closed for page requests when POS identity cannot be verified", async () => {
    maybeSingleMock.mockRejectedValueOnce(new Error("database unavailable"));
    const request = new NextRequest("http://localhost/dashboard", {
      headers: {
        cookie:
          "x-pos-role=OWNER; x-pos-user-id=owner-1; x-pos-user-name=Owner%20User",
      },
    });

    const response = await updateSession(request);

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toContain("Unable to verify access");
  });

  it("does not allow E2E auth bypass in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_BYPASS", "1");
    getUserMock.mockResolvedValueOnce({ data: { user: null } });
    const request = new NextRequest("https://pos.example.com/api/products");

    const response = await updateSession(request);

    expect(getUserMock).toHaveBeenCalled();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Unauthorized" });
  });
});
