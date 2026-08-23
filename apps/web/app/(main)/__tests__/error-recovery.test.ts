import { describe, expect, it, vi } from "vitest";

import {
  isClientRuntimeMismatch,
  reloadLatestAppVersion,
} from "../error-recovery";

describe("isClientRuntimeMismatch", () => {
  it.each([
    new TypeError("Cannot read properties of undefined (reading 'call')"),
    Object.assign(new Error("Loading chunk 512 failed."), {
      name: "ChunkLoadError",
    }),
    new Error("Failed to fetch dynamically imported module"),
    new Error("Importing a module script failed"),
  ])("recognizes a stale client runtime signature", (error) => {
    expect(isClientRuntimeMismatch(error)).toBe(true);
  });

  it("checks nested causes without classifying an ordinary render error", () => {
    expect(
      isClientRuntimeMismatch(
        Object.assign(new Error("Navigasi gagal"), {
          cause: new Error("Loading CSS chunk 91 failed."),
        }),
      ),
    ).toBe(true);
    expect(
      isClientRuntimeMismatch(new Error("Data transaksi tidak ditemukan")),
    ).toBe(false);
  });
});

describe("reloadLatestAppVersion", () => {
  it("clears only POS caches, updates the worker, and reloads", async () => {
    const deleteCache = vi.fn().mockResolvedValue(true);
    const update = vi.fn().mockResolvedValue(undefined);
    const postMessage = vi.fn();
    const reload = vi.fn();

    await reloadLatestAppVersion({
      cacheStorage: {
        keys: vi.fn().mockResolvedValue(["pos-v4", "pos-v5", "other-app"]),
        delete: deleteCache,
      },
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          update,
          waiting: { postMessage },
        }),
      },
      reload,
    });

    expect(deleteCache.mock.calls).toEqual([["pos-v4"], ["pos-v5"]]);
    expect(update).toHaveBeenCalledOnce();
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(reload).toHaveBeenCalledOnce();
  });

  it("still reloads when cleanup fails", async () => {
    const reload = vi.fn();

    await reloadLatestAppVersion({
      cacheStorage: {
        keys: vi.fn().mockRejectedValue(new Error("cache unavailable")),
        delete: vi.fn(),
      },
      serviceWorker: {
        getRegistration: vi
          .fn()
          .mockRejectedValue(new Error("worker unavailable")),
      },
      reload,
    });

    expect(reload).toHaveBeenCalledOnce();
  });
});
