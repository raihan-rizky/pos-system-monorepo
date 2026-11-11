import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("offline POS authorization", () => {
  let browser: Browser;
  let server: Server;
  let origin: string;
  let script: string;

  beforeAll(async () => {
    const requireFromVitest = createRequire(require.resolve("vitest/package.json"));
    const { build } = requireFromVitest("esbuild") as { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
    const result = await build({
      stdin: {
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { RoleProvider, useRole } from './components/providers/RoleProvider';
          import { buildDefaultRolePermissions } from './features/rbac/helpers/rbac-core';
          import { clearClientAuthState } from './lib/auth/pos-session';
          import { ensureOfflineGeneration, invalidateOfflineAccess, saveOfflinePage, listOfflinePages } from './public/offline-vault.mjs';
          window.offlineVault = { ensureOfflineGeneration, invalidateOfflineAccess, saveOfflinePage, listOfflinePages, clearClientAuthState };
          const permissions = buildDefaultRolePermissions();
          if (window.noTransactionPermission) permissions.CASHIER.resources.transaction.create = false;
          window.providerRole = window.initialRole || 'CASHIER';
          window.snapshot = { user: { id:'cashier-1', name:'Kasir', role:window.providerRole, storeId:'store-1' }, authorizationFingerprint:'0123456789abcdef', permissions };
          window.mode = window.initialMode || 'offline';
          window.offlineRequests = 0;
          window.requestCount = 0;
          window.renderedAccess = [];
          if (window.__posOfflineAuthorization && !window.__posOfflineRevocationGuard) {
            const revoked = new Set();
            const listeners = new Set();
            const channel = new BroadcastChannel('pos:offline-access-revoked');
            channel.onmessage = event => {
              const { cashierId, storeId } = event.data;
              revoked.add(JSON.stringify([cashierId, storeId]));
              for (const listener of listeners) listener(cashierId, storeId);
            };
            window.__posOfflineRevocationGuard = {
              has: (cashierId, storeId) => revoked.has(JSON.stringify([cashierId, storeId])),
              subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
              close: () => channel.close(),
            };
          }
          Object.defineProperty(navigator, 'onLine', { configurable:true, get:() => window.mode !== 'offline' });
          window.fetch = async (_url, options) => {
            window.requestCount++;
            if (window.mode === 'offline' || window.mode === 'network-down') { window.offlineRequests++; throw new TypeError('network unavailable'); }
            if (window.mode === 'server-unavailable') { window.offlineRequests++; return new Response('{}', {status:503}); }
            if (window.mode === 'bad-gateway') { window.offlineRequests++; return new Response('{}', {status:502}); }
            if (window.mode === 'denied') return new Response('{}', {status:403});
            if (window.mode === 'malformed') return new Response('{}', {status:200});
            if (window.mode === 'pending') return new Promise((resolve, reject) => {
              options?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
              window.finishVerification = () => resolve(Response.json(window.snapshot));
              window.denyVerification = () => resolve(new Response('{}', {status:403}));
            });
            return Response.json(window.snapshot);
          };
          window.reconnect = (mode) => { window.mode = mode; window.dispatchEvent(new Event('online')); };
          function Probe() {
            const role = useRole();
            window.firstProbe ??= { pos: role.canAccess('/pos'), settings: role.canAccess('/settings'), edit: role.canPerform('product', 'update') };
            window.renderedAccess.push({ visible: role.canAccess('/pos'), create: role.canPerform('transaction', 'create') });
            return <main id='protected' data-pos={String(role.canAccess('/pos'))} data-settings={String(role.canAccess('/settings'))}
              data-create={String(role.canPerform('transaction','create'))} data-edit={String(role.canPerform('product','update'))}
              data-delete-proof={String(role.canPerform('proof_upload','delete'))}>POS</main>;
          }
          createRoot(document.getElementById('root')).render(<RoleProvider role={window.providerRole} userId='cashier-1' userName='Kasir'
            storeId='store-1' authorizationFingerprint='0123456789abcdef' permissions={permissions} permissionsVerified={window.initiallyVerified !== false}><Probe /></RoleProvider>);
        `,
        resolveDir: process.cwd(), sourcefile: "offline-authorization-fixture.tsx", loader: "tsx",
      },
      plugins: [{
        name: "offline-auth-test-stubs",
        setup(plugin: any) {
          plugin.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "offline-stub" }));
          plugin.onResolve({ filter: /^@\/features\/rbac\/components\/AccessStatus$/ }, () => ({ path: "status", namespace: "offline-stub" }));
          plugin.onLoad({ filter: /.*/, namespace: "offline-stub" }, (args: any) => ({
            contents: args.path === "navigation" ? "export const usePathname = () => location.pathname;" : "import React from 'react'; export const AccessStatus = () => <div id='blocked'>blocked</div>;",
            loader: "jsx", resolveDir: process.cwd(),
          }));
        },
      }],
      alias: { "@": process.cwd() }, jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife",
    });
    script = result.outputFiles[0].text;
    server = createServer((_request, response) => { response.writeHead(200, { "Content-Type": "text/html" }); response.end('<div id="root"></div>'); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server unavailable");
    origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });

  async function open(options: { handoff?: boolean; fingerprint?: string; verified?: boolean; path?: string;
    cashierId?: string; storeId?: string; role?: string; preparedAt?: string; revoked?: boolean; noTransactionPermission?: boolean; mode?: string; vaultMissing?: boolean; providerRole?: string } = {}, context?: BrowserContext) {
    const page = context ? await context.newPage() : await browser.newPage();
    await page.goto(`${origin}${options.path ?? "/pos"}`);
    await page.evaluate(async ({ handoff, fingerprint, verified, cashierId, storeId, role, preparedAt, revoked, noTransactionPermission, mode, vaultMissing, providerRole }) => {
      (window as any).initiallyVerified = verified;
      (window as any).noTransactionPermission = noTransactionPermission;
      (window as any).initialMode = mode;
      (window as any).initialRole = providerRole;
      if (revoked) localStorage.setItem('pos:offline-access-revoked:["cashier-1","store-1"]', 'revoked');
      if (handoff) {
        const snapshot = {
          cashierId: cashierId ?? "cashier-1", storeId: storeId ?? "store-1", role: role ?? "CASHIER",
          authorizationFingerprint: fingerprint ?? "0123456789abcdef", revocationMarker: null,
          vaultGeneration: "a".repeat(32), preparedAt: preparedAt ?? new Date().toISOString(),
        };
        if (!vaultMissing) await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open("pos-offline-access", 2);
          request.onupgradeneeded = () => {
            request.result.createObjectStore("pages", { keyPath: "id" });
            request.result.createObjectStore("generations", { keyPath: "id" });
          };
          request.onsuccess = () => {
            const db = request.result;
            const id = JSON.stringify([snapshot.cashierId, snapshot.storeId]);
            const tx = db.transaction(["pages", "generations"], "readwrite");
            tx.objectStore("pages").put({ id, ...snapshot });
            tx.objectStore("generations").put({ id, value: snapshot.vaultGeneration });
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
          };
          request.onerror = () => reject(request.error);
        });
        (window as any).__posOfflineAuthorization = snapshot;
      }
    }, options);
    await page.addScriptTag({ content: script });
    // Offline startup verifies the local PIN handoff without sending a request.
    await page.waitForFunction((waitForRequest) => waitForRequest
      ? (window as any).requestCount > 0
      : Boolean((window as any).firstProbe), (options.mode ?? "offline") !== "offline");
    return page;
  }

  it("keeps only permitted POS actions after a verified PIN handoff while offline", async () => {
    const page = await open({ handoff: true });
    try {
      await expect.poll(() => page.locator("#protected").isVisible()).toBe(true);
      await expect.poll(() => page.locator("#protected").getAttribute("data-pos")).toBe("true");
      expect(await page.evaluate(() => (window as any).requestCount)).toBe(0);
      expect(await page.locator("#protected").getAttribute("data-create")).toBe("true");
      expect(await page.locator("#protected").getAttribute("data-settings")).toBe("false");
      expect(await page.locator("#protected").getAttribute("data-edit")).toBe("false");
    } finally { await page.close(); }
  }, 15_000);

  it("restores the owner's proof deletion permission after online verification", async () => {
    const page = await open({ mode: "online", providerRole: "OWNER" });
    try { await expect.poll(() => page.locator("#protected").getAttribute("data-delete-proof")).toBe("true"); }
    finally { await page.close(); }
  }, 15_000);

  it("keeps the login page visible after access is revoked while denying protected actions", async () => {
    const page = await open({ path: "/login", mode: "pending" });
    try {
      await page.evaluate(() => (window as any).denyVerification());
      await expect.poll(() => page.locator("#protected").isVisible()).toBe(true);
      expect(await page.locator("#protected").getAttribute("data-pos")).toBe("false");
      expect(await page.locator("#protected").getAttribute("data-create")).toBe("false");
    } finally { await page.close(); }
  }, 15_000);

  it.each(["network-down", "server-unavailable", "bad-gateway"])("allows the PIN-unlocked POS after %s when the browser still reports online", async mode => {
    const page = await open({ handoff: true, mode });
    try {
      await expect.poll(() => page.locator("#protected").isVisible()).toBe(true);
      expect(await page.locator("#protected").getAttribute("data-pos")).toBe("true");
      expect(await page.locator("#protected").getAttribute("data-settings")).toBe("false");
      expect(await page.locator("#protected").getAttribute("data-edit")).toBe("false");
    } finally { await page.close(); }
  }, 15_000);

  it("keeps a PIN-unlocked page blocked until online permissions are checked", async () => {
    const page = await open({ handoff: true, mode: "pending" });
    try {
      expect(await page.locator("#protected").isVisible()).toBe(false);
      await page.evaluate(() => (window as any).finishVerification());
      await expect.poll(() => page.locator("#protected").isVisible()).toBe(true);
    } finally { await page.close(); }
  }, 15_000);

  it.each([true, false])("does not grant snapshot permissions on the first client render (handoff: %s)", async handoff => {
    const page = await open({ handoff });
    try { expect(await page.evaluate(() => (window as any).firstProbe)).toEqual({ pos: false, settings: false, edit: false }); }
    finally { await page.close(); }
  }, 15_000);

  it("revokes a delayed server denial even if the browser goes offline first", async () => {
    const page = await open({ handoff: true, mode: "pending" });
    try {
      await page.evaluate(() => {
        (window as any).mode = "offline";
        window.dispatchEvent(new Event("offline"));
        (window as any).denyVerification();
      });
      await expect.poll(() => page.locator("#protected").isVisible()).toBe(false);
      await expect.poll(() => page.evaluate(() => localStorage.getItem('pos:offline-access-revoked:["cashier-1","store-1"]'))).not.toBeNull();
    } finally { await page.close(); }
  }, 15_000);

  it.each([
    ["missing handoff", {}], ["wrong fingerprint", { handoff: true, fingerprint: "fedcba9876543210" }],
    ["unverified snapshot", { handoff: true, verified: false }], ["different route", { handoff: true, path: "/settings" }],
    ["different cashier", { handoff: true, cashierId: "other" }], ["different store", { handoff: true, storeId: "other" }],
    ["different role", { handoff: true, role: "OWNER" }], ["expired vault", { handoff: true, preparedAt: "2020-01-01T00:00:00.000Z" }],
    ["previously revoked vault", { handoff: true, revoked: true }],
  ])("blocks %s while offline", async (_label, options) => {
    const page = await open(options);
    try { await expect.poll(() => page.locator("#protected").isVisible()).toBe(false); }
    finally { await page.close(); }
  }, 15_000);

  it("keeps transaction creation denied when it is absent from the saved permission snapshot", async () => {
    const page = await open({ handoff: true, noTransactionPermission: true });
    try {
      await expect.poll(() => page.locator("#protected").isVisible()).toBe(true);
      expect(await page.locator("#protected").getAttribute("data-create")).toBe("false");
    } finally { await page.close(); }
  }, 15_000);

  it("blocks a stale PIN handoff whose vault was deleted before the provider mounted", async () => {
    const page = await open({ handoff: true, vaultMissing: true });
    try { await expect.poll(() => page.locator("#protected").isVisible()).toBe(false); }
    finally { await page.close(); }
  }, 15_000);

  it("blocks an active offline session after another tab revokes the vault", async () => {
    const page = await open({ handoff: true });
    try {
      await expect.poll(() => page.locator("#protected").isVisible()).toBe(true);
      await page.evaluate(() => {
        const key = 'pos:offline-access-revoked:["cashier-1","store-1"]';
        localStorage.setItem(key, "revoked");
        window.dispatchEvent(new StorageEvent("storage", { key, newValue: "revoked" }));
      });
      await expect.poll(() => page.locator("#protected").isVisible()).toBe(false);
    } finally { await page.close(); }
  }, 15_000);

  it("blocks immediately on reconnect until a matching server response arrives", async () => {
    const page = await open({ handoff: true });
    try {
      await expect.poll(() => page.locator("#protected").isVisible()).toBe(true);
      await page.evaluate(() => (window as any).reconnect("pending"));
      await expect.poll(() => page.locator("#protected").isVisible()).toBe(false);
      await page.waitForFunction(() => Boolean((window as any).finishVerification));
      await page.evaluate(() => (window as any).finishVerification());
      await expect.poll(() => page.locator("#protected").isVisible()).toBe(true);
    } finally { await page.close(); }
  }, 15_000);

  it.each(["denied", "logout"])("removes the saved vault on %s when the revocation marker cannot be written", async mode => {
    const page = await open({ handoff: true });
    try {
      await page.evaluate(async () => {
        const vaultGeneration = await (window as any).offlineVault.ensureOfflineGeneration("cashier-1", "store-1");
        await (window as any).offlineVault.saveOfflinePage({ id: JSON.stringify(["cashier-1", "store-1"]), revocationMarker: null, vaultGeneration });
        document.cookie = "x-pos-user-id=cashier-1; path=/";
        document.cookie = "x-pos-store-id=store-1; path=/";
        Storage.prototype.setItem = () => { throw new Error("storage quota exceeded"); };
      });
      await page.evaluate(value => {
        if (value === "denied") (window as any).reconnect("denied");
        else (window as any).offlineVault.clearClientAuthState();
      }, mode);
      await expect.poll(() => page.evaluate(async () => (await (window as any).offlineVault.listOfflinePages()).length)).toBe(0);
    } finally { await page.close(); }
  }, 15_000);

  it("blocks another offline tab after denial even when the revocation marker cannot be written", async () => {
    const context = await browser.newContext();
    try {
      const first = await open({ handoff: true }, context);
      const second = await open({ handoff: true }, context);
      await expect.poll(() => second.locator("#protected").isVisible()).toBe(true);
      await first.evaluate(() => {
        Storage.prototype.setItem = () => { throw new Error("storage quota exceeded"); };
        (window as any).reconnect("denied");
      });
      await expect.poll(() => first.locator("#protected").isVisible()).toBe(false);
      await expect.poll(() => second.locator("#protected").isVisible()).toBe(false);
    } finally { await context.close(); }
  }, 15_000);

  it("never grants a handoff while revocation is waiting to delete the vault", async () => {
    const context = await browser.newContext();
    try {
      const revoking = await open({ handoff: true }, context);
      const late = await context.newPage();
      await late.goto(`${origin}/pos`);
      await late.evaluate(async () => {
        (window as any).initialMode = "offline";
        (window as any).__posOfflineAuthorization = {
          cashierId: "cashier-1", storeId: "store-1", role: "CASHIER", authorizationFingerprint: "0123456789abcdef",
          revocationMarker: null, vaultGeneration: "a".repeat(32), preparedAt: new Date().toISOString(),
        };
        const request = indexedDB.open("pos-offline-access", 2);
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const tx = db.transaction("generations", "readwrite");
        let held = true;
        (window as any).releaseStorageLock = () => { held = false; };
        const keepAlive = () => {
          const read = tx.objectStore("generations").get("lock");
          read.onsuccess = () => { if (held) keepAlive(); };
        };
        tx.oncomplete = () => db.close();
        keepAlive();
      });
      const pending = revoking.evaluate(async () => {
        Storage.prototype.setItem = () => { throw new Error("storage quota exceeded"); };
        await (window as any).offlineVault.invalidateOfflineAccess("cashier-1", "store-1");
      });
      await expect.poll(() => revoking.locator("#protected").isVisible()).toBe(false);
      await late.addScriptTag({ content: script });
      await late.waitForFunction(() => Boolean((window as any).firstProbe));
      expect(await late.evaluate(() => (window as any).firstProbe)).toEqual({ pos: false, settings: false, edit: false });
      expect(await late.locator("#protected").isVisible()).toBe(false);
      await late.evaluate(() => (window as any).releaseStorageLock());
      await pending;
      await expect.poll(() => late.locator("#protected").isVisible()).toBe(false);
      expect(await late.locator("#protected").getAttribute("data-create")).toBe("false");
    } finally { await context.close(); }
  }, 15_000);

  it("never grants a handoff when revocation is delayed before opening IndexedDB", async () => {
    const context = await browser.newContext();
    try {
      const revoking = await open({ handoff: true }, context);
      const late = await context.newPage();
      await late.goto(`${origin}/pos`);
      const savedHandoff = await revoking.evaluate(async () => (await (window as any).offlineVault.listOfflinePages())[0]);
      await late.evaluate((snapshot) => {
        (window as any).initialMode = "offline";
        (window as any).__posOfflineAuthorization = snapshot;
        const revoked = new Set<string>();
        const channel = new BroadcastChannel("pos:offline-access-revoked");
        channel.onmessage = event => revoked.add(JSON.stringify([event.data?.cashierId, event.data?.storeId]));
        (window as any).__posOfflineRevocationGuard = {
          has: (cashierId: string, storeId: string) => revoked.has(JSON.stringify([cashierId, storeId])),
          subscribe: () => () => {},
          close: () => channel.close(),
        };
      }, savedHandoff);
      const pending = revoking.evaluate(async () => {
        Storage.prototype.setItem = () => { throw new Error("storage quota exceeded"); };
        const open = indexedDB.open.bind(indexedDB);
        indexedDB.open = ((...args: Parameters<IDBFactory["open"]>) => {
          const request = open(...args);
          const add = request.addEventListener.bind(request);
          request.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
            if (type === "success") {
              add(type, event => { (window as any).releaseOpen = () => typeof listener === "function" ? listener.call(request, event) : listener.handleEvent(event); }, options);
            } else add(type, listener, options);
          }) as typeof request.addEventListener;
          Object.defineProperty(request, "onsuccess", { set(listener) { request.addEventListener("success", listener); } });
          return request;
        }) as IDBFactory["open"];
        await (window as any).offlineVault.invalidateOfflineAccess("cashier-1", "store-1");
      });
      await revoking.waitForFunction(() => Boolean((window as any).releaseOpen));
      await new Promise(resolve => setTimeout(resolve, 100));
      await late.addScriptTag({ content: script });
      await late.waitForFunction(() => Boolean((window as any).firstProbe));
      await new Promise(resolve => setTimeout(resolve, 500));
      expect(await late.evaluate(() => (window as any).renderedAccess.some((entry: any) => entry.visible || entry.create))).toBe(false);
      expect(await late.locator("#protected").getAttribute("data-create")).toBe("false");
      await revoking.evaluate(() => (window as any).releaseOpen());
      await pending;
    } finally { await context.close(); }
  }, 15_000);

  it.each(["denied", "malformed"])("keeps %s server responses blocked and revokes the saved vault", async mode => {
    const page = await open({ handoff: true });
    try {
      await expect.poll(() => page.locator("#protected").isVisible()).toBe(true);
      await page.evaluate(value => (window as any).reconnect(value), mode);
      await expect.poll(() => page.locator("#protected").isVisible()).toBe(false);
      await expect.poll(() => page.evaluate(() => localStorage.getItem('pos:offline-access-revoked:["cashier-1","store-1"]'))).not.toBeNull();
      await page.evaluate(() => {
        (window as any).__posOfflineAuthorization = { cashierId:"cashier-1", storeId:"store-1", role:"CASHIER", authorizationFingerprint:"0123456789abcdef", revocationMarker:null, preparedAt:new Date().toISOString() };
        (window as any).mode = "offline";
        window.dispatchEvent(new Event("offline"));
      });
      expect(await page.locator("#protected").isVisible()).toBe(false);
    } finally { await page.close(); }
  }, 15_000);
});
