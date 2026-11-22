import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { canAuthenticatedUserAccessPage, canAuthenticatedUserPerform } from "../guard";

const getPermissions = vi.hoisted(() => vi.fn());
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: getPermissions }));
vi.mock("@pos/db", () => ({ db: {} }));
vi.mock("@/utils/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

describe("authenticated resource access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    getPermissions.mockResolvedValue(buildDefaultRolePermissions());
  });

  it("observes a permission revocation on the next check", async () => {
    expect(typeof canAuthenticatedUserPerform).toBe("function");
    const granted = buildDefaultRolePermissions();
    granted.SALES.resources["customer.receivable.payment"].create = true;
    const revoked = buildDefaultRolePermissions();
    getPermissions.mockResolvedValueOnce(granted).mockResolvedValueOnce(revoked);

    const user = { role: "SALES" as const };
    await expect(canAuthenticatedUserPerform(user, "customer.receivable.payment", "create")).resolves.toBe(true);
    await expect(canAuthenticatedUserPerform(user, "customer.receivable.payment", "create")).resolves.toBe(false);
  });

  it("fails closed if configured permissions cannot be verified", async () => {
    expect(typeof canAuthenticatedUserPerform).toBe("function");
    getPermissions.mockRejectedValueOnce(new Error("database unavailable"));
    await expect(canAuthenticatedUserPerform({ role: "SALES" }, "customer.receivable", "read"))
      .rejects.toMatchObject({ statusCode: 503 });
  });

  it("checks the authenticated role's current page access", async () => {
    expect(typeof canAuthenticatedUserAccessPage).toBe("function");
    const permissions = buildDefaultRolePermissions();
    permissions.SALES.pages["/customers"] = false;
    getPermissions.mockResolvedValue(permissions);
    await expect(canAuthenticatedUserAccessPage({ role: "SALES" }, "/customers")).resolves.toBe(false);
  });
});
