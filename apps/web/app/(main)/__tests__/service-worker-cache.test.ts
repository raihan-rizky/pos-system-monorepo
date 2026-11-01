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
  const fetchMock = vi.fn().mockImplementation(async () => new Response("asset", { status: 200 }));

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
    fetch: fetchMock,
    Request: class BrowserRequest extends Request {
      constructor(input: string, init?: RequestInit) { super(new URL(input, "https://pos.example"), init); }
    },
    Response,
    URL,
    location: new URL("https://pos.example"),
    console,
  });

  return { listeners, caches, activeCache, fetchMock };
}

describe("service worker runtime cache policy", () => {
  it("does not activate a replacement worker if an unlock dependency cannot be fetched", async () => {
    const worker = loadWorker();
    worker.fetchMock.mockRejectedValue(new TypeError("offline"));
    worker.activeCache.add.mockRejectedValue(new TypeError("offline"));
    let install: Promise<unknown> | undefined;
    worker.listeners.get("install")?.({ waitUntil: (promise: Promise<unknown>) => { install = promise; } });
    await expect(install).rejects.toThrow("offline");
  });

  it("reports whether every public unlock dependency is available in its current cache", async () => {
    const worker = loadWorker();
    const ack = vi.fn();
    worker.activeCache.match.mockImplementation(async (path: string) =>
      path === "/offline.html" ? new Response("fallback", { headers: { "Content-Type": "text/html" } }) : undefined,
    );
    let operation: Promise<unknown> | undefined;
    worker.listeners.get("message")?.({ data: { type: "OFFLINE_CAPABILITY_VERSION" }, ports: [{ postMessage: ack }], waitUntil: (promise: Promise<unknown>) => { operation = promise; } });
    await operation;
    expect(ack).toHaveBeenCalledWith({ version: 1, ready: false });
  });

  it("does not use old cached static assets while preparing a new POS page", async () => {
    const worker = loadWorker();
    worker.fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    worker.activeCache.match.mockResolvedValueOnce(new Response("old script"));
    const respondWith = vi.fn();
    worker.listeners.get("fetch")?.({ request: new Request("https://pos.example/_next/static/chunks/pos.js", { headers: { "x-pos-offline-prepare": "1" } }), respondWith });
    await expect(respondWith.mock.calls[0][0]).rejects.toThrow("offline");
    expect(worker.activeCache.match).not.toHaveBeenCalled();
  });

  it("shows the public offline page on a failed navigation without caching the authenticated response", async () => {
    const worker = loadWorker();
    worker.fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    worker.activeCache.match.mockResolvedValueOnce(new Response("offline fallback"));
    const respondWith = vi.fn();
    worker.listeners.get("fetch")?.({
      request: { url: "https://pos.example/pos", method: "GET", mode: "navigate" },
      respondWith,
    });
    expect(respondWith).toHaveBeenCalledOnce();
    const response = await respondWith.mock.calls[0][0];
    expect(await response.text()).toBe("offline fallback");
    expect(worker.activeCache.put).not.toHaveBeenCalled();
  });
  it("offers offline POS on a temporary server outage without masking an authorization response", async () => {
    const worker = loadWorker();
    worker.fetchMock.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    worker.activeCache.match.mockResolvedValueOnce(new Response("offline fallback"));
    const respondWith = vi.fn();
    worker.listeners.get("fetch")?.({ request: { url: "https://pos.example/pos", method: "GET", mode: "navigate" }, respondWith });
    expect(await (await respondWith.mock.calls[0][0]).text()).toBe("offline fallback");

    worker.fetchMock.mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    worker.listeners.get("fetch")?.({ request: { url: "https://pos.example/pos", method: "GET", mode: "navigate" }, respondWith });
    expect((await respondWith.mock.calls[1][0]).status).toBe(403);
  });
  it("never caches Next.js data responses", () => {
    const worker = loadWorker();
    const respondWith = vi.fn();

    worker.listeners.get("fetch")?.({
      request: new Request(
        "https://pos.example/_next/data/private.json",
      ),
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
    expect(worker.caches.open).not.toHaveBeenCalled();
  });

  it("uses an explicitly prepared static asset when the network is unavailable", async () => {
    const worker = loadWorker();
    worker.fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    worker.activeCache.match.mockResolvedValueOnce(new Response("cached script"));
    const respondWith = vi.fn();
    const request = new Request("https://pos.example/_next/static/chunks/pos.js");
    worker.listeners.get("fetch")?.({ request, respondWith });
    expect(respondWith).toHaveBeenCalledOnce();
    const response = await respondWith.mock.calls[0][0];
    expect(await response.text()).toBe("cached script");
    expect(worker.activeCache.put).not.toHaveBeenCalled();
  });

  it("does not accept decrypted pages through worker messages", () => {
    const worker = loadWorker();
    const ticket = "a".repeat(32);
    const ack = vi.fn();
    worker.listeners.get("message")?.({
      source: { id: "original-tab", url: "https://pos.example/pos" },
      ports: [{ postMessage: ack }],
      data: { type: "OFFLINE_UNLOCK", ticket, html: "<!doctype html><html>opened</html>" },
    });
    expect(ack).not.toHaveBeenCalled();
    expect(worker.caches.open).not.toHaveBeenCalled();
    expect(worker.activeCache.put).not.toHaveBeenCalled();
  });

  it("does not cache authenticated React Server Component responses", () => {
    const worker = loadWorker();
    const respondWith = vi.fn();

    worker.listeners.get("fetch")?.({
      request: new Request("https://pos.example/pos?_rsc=abc", {
        headers: { RSC: "1" },
      }),
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
    expect(worker.caches.open).not.toHaveBeenCalled();
  });

  it("does not cache other unclassified application responses", () => {
    const worker = loadWorker();
    const respondWith = vi.fn();

    worker.listeners.get("fetch")?.({
      request: new Request("https://pos.example/private-data"),
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
    expect(worker.caches.open).not.toHaveBeenCalled();
  });

  it("deletes old POS caches without deleting another app cache", async () => {
    const worker = loadWorker(["pos-v5", "pos-v6", "pos-v7", "pos-v8", "pos-v9", "pos-v10", "pos-offline-static-v1", "other-app"]);
    let activation: Promise<unknown> | undefined;

    worker.listeners.get("activate")?.({
      waitUntil: (promise: Promise<unknown>) => {
        activation = promise;
      },
    });
    await activation;

    expect(worker.caches.delete.mock.calls).toEqual([["pos-v5"], ["pos-v6"], ["pos-v7"], ["pos-v8"], ["pos-v9"]]);
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
    expect(worker.caches.open).toHaveBeenCalledWith("pos-v10");
    expect(worker.activeCache.match).toHaveBeenCalledOnce();
  });
});
