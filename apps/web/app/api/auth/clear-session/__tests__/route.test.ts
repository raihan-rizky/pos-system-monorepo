import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const getAllMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: getAllMock,
  })),
}));

describe("POST /api/auth/clear-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllMock.mockReturnValue([
      { name: "sb-project-ref-auth-token", value: "owner-token" },
      { name: "sb-project-ref-auth-token.0", value: "owner-token-chunk" },
      { name: "x-pos-role", value: "OWNER" },
      { name: "sidebar_collapsed", value: "true" },
    ]);
  });

  it("expires POS identity cookies and Supabase auth cookies without touching unrelated cookies", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(response.cookies.get("x-pos-role")?.value).toBe("");
    expect(response.cookies.get("x-pos-user-id")?.value).toBe("");
    expect(response.cookies.get("x-pos-user-name")?.value).toBe("");
    expect(response.cookies.get("sb-project-ref-auth-token")?.value).toBe("");
    expect(response.cookies.get("sb-project-ref-auth-token.0")?.value).toBe("");
    expect(response.cookies.get("sidebar_collapsed")).toBeUndefined();
  });
});
