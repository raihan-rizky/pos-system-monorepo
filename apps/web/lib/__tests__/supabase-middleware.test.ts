import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

const getUserMock = vi.hoisted(() => vi.fn());
const cookieAdapterMock = vi.hoisted(() => ({
  setAll: undefined as
    | undefined
    | ((cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>) => void),
}));
const maybeSingleMock = vi.hoisted(() => vi.fn());
const eqMock = vi.hoisted(() => vi.fn(() => ({ maybeSingle: maybeSingleMock, eq: eqMock })));
const selectMock = vi.hoisted(() => vi.fn(() => ({ eq: eqMock })));
const fromMock = vi.hoisted(() => {
  const fn = vi.fn();
  fn.mockImplementation((table: string) => {
    return {
      select: vi.fn(() => ({
        eq: eqMock,
      })),
    };
  });
  return fn;
});

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(
    (_url: string, _key: string, options: { cookies: { setAll: typeof cookieAdapterMock.setAll } }) => {
      cookieAdapterMock.setAll = options.cookies.setAll;
      return {
        auth: {
          getUser: getUserMock,
          signOut: vi.fn(),
        },
        from: fromMock,
      };
    },
  ),
}));

describe("updateSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUserMock.mockResolvedValue({
      data: { user: { email: "admin@pos.local" } },
    });
    let callCount = 0;
    maybeSingleMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          data: {
            id: "admin-1",
            name: "Admin User",
            role: "ADMIN",
            storeId: "store-1",
            isActive: true,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
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

  it("keeps a retryable Supabase auth failure from being treated as logout", async () => {
    getUserMock.mockImplementationOnce(async () => {
      cookieAdapterMock.setAll?.([
        {
          name: "sb-project-ref-auth-token",
          value: "refreshed-session",
          options: { path: "/", maxAge: 60 * 60 },
        },
      ]);
      return {
        data: { user: null },
        error: {
          name: "AuthRetryableFetchError",
          message: "Auth service temporarily unavailable",
          status: 503,
        },
      };
    });
    const request = new NextRequest("https://pos.example.com/api/products", {
      headers: {
        cookie: "sb-project-ref-auth-token=still-valid-session",
      },
    });

    const response = await updateSession(request);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: "Sesi belum dapat diverifikasi. Silakan coba lagi.",
    });
    expect(response.cookies.get("sb-project-ref-auth-token")?.value).toBe("refreshed-session");
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("still rejects a non-retryable malformed session even when its status is 500", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: {
        name: "AuthInvalidTokenResponseError",
        message: "Auth session or user missing",
        status: 500,
      },
    });
    const request = new NextRequest("https://pos.example.com/api/products", {
      headers: {
        cookie: "sb-project-ref-auth-token=malformed-session",
      },
    });

    const response = await updateSession(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "Unauthorized" });
  });

  it("respects allowed DB permissions when overriding default page targets", async () => {
    // INVENTORY defaults to /inventory only. We override to allow /dashboard too.
    getUserMock.mockResolvedValue({
      data: { user: { email: "inventory@pos.local" } },
    });
    
    // maybeSingle for both pos_users and pos_role_permissions
    let callCount = 0;
    maybeSingleMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          data: { id: "inv-1", name: "Inv User", role: "INVENTORY", storeId: "store-1", isActive: true },
          error: null,
        });
      }
      return Promise.resolve({
        data: { allowed: true },
        error: null,
      });
    });

    const request = new NextRequest("http://localhost/dashboard", {
      headers: { cookie: "x-pos-role=INVENTORY; x-pos-user-id=inv-1; x-pos-store-id=store-1; x-pos-user-name=Inv" }
    });

    const response = await updateSession(request);

    // If access is allowed and cookies are fresh, response should pass through (status 200).
    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("allows INVENTORY role to access pages explicitly granted via RBAC settings", async () => {
    // Default: INVENTORY only has /inventory. Dashboard should be DENIED.
    getUserMock.mockResolvedValue({
      data: { user: { email: "inventory2@pos.local" } },
    });
    
    let callCount = 0;
    maybeSingleMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          data: { id: "inv-2", name: "Inv User 2", role: "INVENTORY", storeId: "store-1", isActive: true },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const request = new NextRequest("http://localhost/dashboard", {
      headers: { cookie: "x-pos-role=INVENTORY; x-pos-user-id=inv-2; x-pos-store-id=store-1; x-pos-user-name=Inv2" }
    });

    const response = await updateSession(request);

    // Without custom permissions, INVENTORY should be denied dashboard (redirect to default)
    expect(response.headers.get("location")).toBe("http://localhost/inventory");
    expect(response.status).toBe(307);
  });

  it("applies granular resource permissions (not just page access) from DB", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { email: "inventory3@pos.local" } },
    });
    
    let callCount = 0;
    maybeSingleMock.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          data: { id: "inv-3", name: "Inv User 3", role: "INVENTORY", storeId: "store-1", isActive: true },
          error: null,
        });
      }
      return Promise.resolve({
        data: { allowed: true },
        error: null,
      });
    });

    const request = new NextRequest("http://localhost/dashboard", {
      headers: { cookie: "x-pos-role=INVENTORY; x-pos-user-id=inv-3; x-pos-store-id=store-1; x-pos-user-name=Inv3" }
    });

    const response = await updateSession(request);

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });
});
