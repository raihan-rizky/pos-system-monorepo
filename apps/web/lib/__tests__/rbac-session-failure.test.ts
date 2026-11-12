import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser, requireRole } from "@/lib/rbac/guard";
import { isTransientAuthFailure } from "@/lib/auth/session-failure";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), findFirst: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));
vi.mock("@pos/db", () => ({ db: { user: { findFirst: mocks.findFirst } } }));

describe("RBAC during session verification failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(null);
  });

  it.each([
    { name: "AuthRetryableFetchError", status: 0 },
    { name: "AuthApiError", status: 409, code: "conflict" },
    { name: "AuthApiError", status: 500, code: "unexpected_failure" },
  ])("returns temporary unavailability for $name/$status without granting access", async (error) => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    expect(isTransientAuthFailure(error)).toBe(true);
    await expect(requireRole("SALES")).rejects.toMatchObject({ statusCode: 503 });
    await expect(getCurrentUser()).rejects.toMatchObject({ statusCode: 503 });
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("requires a new login after the server rejects the refresh token", async () => {
    const error = { status: 400, code: "refresh_token_not_found" };
    mocks.getUser.mockResolvedValue({ data: { user: null }, error });
    expect(isTransientAuthFailure(error)).toBe(false);
    await expect(requireRole("SALES")).rejects.toMatchObject({ statusCode: 401 });
    await expect(getCurrentUser()).resolves.toBeNull();
  });
});
