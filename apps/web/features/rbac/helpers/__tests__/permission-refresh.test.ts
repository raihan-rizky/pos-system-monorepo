import { afterEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "../rbac-core";
import { loadCurrentRoleAccess, startPermissionRefresh } from "../permission-refresh";

describe("live permission verification", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("always requests current permissions without using a browser cache", async () => {
    const snapshot = { permissions: buildDefaultRolePermissions(), authorizationFingerprint: "new-version", user: { id: "sales-1", name: "Sales", role: "SALES", storeId: "store-1" } };
    const fetcher = vi.fn(async () => Response.json(snapshot));
    vi.stubGlobal("fetch", fetcher);
    expect(await loadCurrentRoleAccess(new AbortController().signal)).toEqual(snapshot);
    expect(fetcher).toHaveBeenCalledWith("/api/auth/permissions", expect.objectContaining({ cache: "no-store", credentials: "same-origin" }));
  });

  it("rejects an incomplete response rather than restoring default grants", async () => {
    const permissions = buildDefaultRolePermissions();
    delete permissions.SALES.resources.transaction;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ permissions, authorizationFingerprint: "version", user: { id: "sales-1", name: "Sales", role: "SALES", storeId: "store-1" } })));
    await expect(loadCurrentRoleAccess(new AbortController().signal)).rejects.toThrow();
  });

  it("ends a stalled verification so the UI can deny access and recover on a later refresh", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      requestSignal = init.signal as AbortSignal;
      requestSignal.addEventListener("abort", () => reject(new Error("verification timeout")));
    })));
    const request = loadCurrentRoleAccess(new AbortController().signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(10_001);
    expect(requestSignal?.aborted).toBe(true);
    expect(await request).toBeInstanceOf(Error);
  });

  it("refreshes on focus, save notification and visible polling, and cancels work on unmount", async () => {
    vi.useFakeTimers();
    const windowEvents = new EventTarget();
    const documentEvents = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("window", windowEvents);
    vi.stubGlobal("document", documentEvents);
    const refresh = vi.fn(async (_signal: AbortSignal) => undefined);
    const stop = startPermissionRefresh(refresh);
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    windowEvents.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    windowEvents.dispatchEvent(new Event("pos:permissions-changed"));
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(3);
    documentEvents.visibilityState = "hidden";
    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    documentEvents.visibilityState = "visible";
    documentEvents.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(4);
    const lastSignal = refresh.mock.calls.at(-1)![0];
    stop();
    windowEvents.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(refresh).toHaveBeenCalledTimes(4);
    expect(lastSignal.aborted).toBe(true);
  });
});
