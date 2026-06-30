import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateSessionMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/supabase/middleware", () => ({
  updateSession: updateSessionMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    child: () => ({
      debug: vi.fn(),
      error: vi.fn(),
    }),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));

import { middleware } from "../../middleware";

describe("middleware fail-closed behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 503 when session verification fails instead of allowing the request through", async () => {
    updateSessionMock.mockRejectedValueOnce(new Error("supabase unavailable"));
    const request = new NextRequest("http://localhost/dashboard");

    const response = await middleware(request);

    expect(response.status).toBe(503);
    await expect(response.text()).resolves.toContain("Unable to verify access");
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
