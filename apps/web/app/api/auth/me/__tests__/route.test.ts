import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const getCurrentUserMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  AuthError: class AuthError extends Error {
    public statusCode: number;
    constructor(statusCode: number, message?: string) {
      super(message || "auth");
      this.statusCode = statusCode;
    }
  },
  getCurrentUser: getCurrentUserMock,
  handleAuthError: handleAuthErrorMock,
}));

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
  });

  it("returns the server-resolved POS user identity", async () => {
    getCurrentUserMock.mockResolvedValue({
      id: "admin-1",
      username: "admin",
      name: "Admin Toko",
      role: "ADMIN",
      storeId: "store-main",
      isActive: true,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user).toEqual({
      id: "admin-1",
      username: "admin",
      name: "Admin Toko",
      role: "ADMIN",
      storeId: "store-main",
    });
  });

  it("returns auth errors from the shared guard handler", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    handleAuthErrorMock.mockReturnValue(
      Response.json({ message: "Unauthorized" }, { status: 401 }),
    );

    const response = await GET();

    expect(response.status).toBe(401);
  });
});
