import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getGlobalRolePermissions: vi.fn(),
}));

vi.mock("next/font/google", () => ({
  Inter: () => ({ variable: "font-inter" }),
  JetBrains_Mono: () => ({ variable: "font-mono" }),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/features/rbac/helpers/rbac-server", () => ({
  getGlobalRolePermissions: mocks.getGlobalRolePermissions,
}));

vi.mock("../providers", async () => {
  const ReactModule = await import("react");

  return {
    Providers: ({ children }: { children: React.ReactNode }) =>
      ReactModule.createElement(ReactModule.Fragment, null, children),
  };
});

describe("RootLayout", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("does not use default E2E permissions in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_BYPASS", "1");
    mocks.cookies.mockResolvedValueOnce({
      get: vi.fn(() => undefined),
    });
    mocks.getGlobalRolePermissions.mockResolvedValueOnce(buildDefaultRolePermissions());
    const { default: RootLayout } = await import("../layout");

    const element = await RootLayout({
      children: React.createElement("main", null, "Konten"),
    });

    expect(mocks.getGlobalRolePermissions).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(element)).toContain("Konten");
  });
});
