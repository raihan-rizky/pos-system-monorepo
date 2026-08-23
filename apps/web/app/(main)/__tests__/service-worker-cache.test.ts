import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

function loadWorker(cacheNames = ["pos-v5", "other-app"]) {
  const listeners = new Map<string, (event: any) => void>();
  const activeCache = {
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
  };
  const caches = {
    keys: vi.fn().mockResolvedValue(cacheNames),
    delete: vi.fn().mockResolvedValue(true),
    open: vi.fn().mockResolvedValue(activeCache),
    match: vi.fn().mockResolvedValue(undefined),
  };
  const source = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

  runInNewContext(source, {
    self: {
      addEventListener: (type: string, handler: (event: any) => void) =>
        listeners.set(type, handler),
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn() },
      registration: { showNotification: vi.fn() },
    },
    clients: {
      matchAll: vi.fn().mockResolvedValue([]),
      openWindow: vi.fn(),
    },
    caches,
    fetch: vi.fn().mockResolvedValue(new Response("asset", { status: 200 })),
    Request,
    Response,
    URL,
    location: new URL("https://pos.example"),
    console,
  });

  return { listeners, caches, activeCache };
}

describe("service worker runtime cache policy", () => {
  it("does not intercept Next.js assets", () => {
    const worker = loadWorker();
    const respondWith = vi.fn();

    worker.listeners.get("fetch")?.({
      request: new Request(
        "https://pos.example/_next/static/chunks/app/dashboard.js",
      ),
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
    expect(worker.caches.open).not.toHaveBeenCalled();
  });

  it("deletes old POS caches without deleting another app cache", async () => {
    const worker = loadWorker(["pos-v5", "pos-v6", "other-app"]);
    let activation: Promise<unknown> | undefined;

    worker.listeners.get("activate")?.({
      waitUntil: (promise: Promise<unknown>) => {
        activation = promise;
      },
    });
    await activation;

    expect(worker.caches.delete.mock.calls).toEqual([["pos-v5"]]);
  });

  it("still caches application icons in the active POS cache", async () => {
    const worker = loadWorker();
    const respondWith = vi.fn();

    worker.listeners.get("fetch")?.({
      request: new Request("https://pos.example/icons/icon-192.png"),
      respondWith,
    });

    expect(respondWith).toHaveBeenCalledOnce();
    await respondWith.mock.calls[0][0];
    expect(worker.caches.open).toHaveBeenCalledWith("pos-v6");
    expect(worker.activeCache.match).toHaveBeenCalledOnce();
  });
});
