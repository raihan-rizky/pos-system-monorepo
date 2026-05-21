import { beforeEach, describe, expect, it, vi } from "vitest";
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
        isActive: true,
      },
      error: null,
    });
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
  });
});
