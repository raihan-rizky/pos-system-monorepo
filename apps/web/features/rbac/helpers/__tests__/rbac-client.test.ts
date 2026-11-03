import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions, flattenRolePermissions } from "../rbac-core";
import { buildPermissionPatch, loadRbacSettings, saveRbacChanges } from "../rbac-client";

describe("RBAC editor persistence", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends only changed permissions with the loaded concurrency version", async () => {
    const baseline = buildDefaultRolePermissions();
    const current = structuredClone(baseline);
    current.SALES.resources.transaction.update = true;
    const expected = [{ role: "SALES", scope: "resource", target: "transaction", action: "update", allowed: true }];
    expect(buildPermissionPatch(current, baseline)).toEqual(expected);
    const fetcher = vi.fn(async () => Response.json({ permissions: flattenRolePermissions(current), version: "b".repeat(64), audit: [] }));
    vi.stubGlobal("fetch", fetcher);
    await saveRbacChanges(current, baseline, "a".repeat(64));
    const request = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[0]).toBe("/api/settings/rbac");
    expect(JSON.parse(request[1].body as string)).toEqual({ permissions: expected, version: "a".repeat(64) });
  });

  it("keeps local edits intact on a conflict so the Owner can review or reload", async () => {
    const baseline = buildDefaultRolePermissions();
    const current = structuredClone(baseline);
    current.SALES.resources.transaction.update = true;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ code: "Conflict", message: "Hak akses telah berubah" }, { status: 409 })));
    await expect(saveRbacChanges(current, baseline, "a".repeat(64))).rejects.toMatchObject({ statusCode: 409 });
    expect(current.SALES.resources.transaction.update).toBe(true);
    expect(baseline.SALES.resources.transaction.update).toBe(false);
  });

  it("does not treat incomplete settings as default grants", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ permissions: [], version: "a".repeat(64) })));
    await expect(loadRbacSettings()).rejects.toThrow();
  });
});
