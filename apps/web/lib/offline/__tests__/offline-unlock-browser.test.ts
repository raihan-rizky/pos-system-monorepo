import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

let server: Server;
let browser: Browser;
let baseUrl: string;
let failPreparedAsset = false;
let invalidPreparedAssetMime = false;
let preparedFingerprint = "0123456789abcdef";
let permissionStatus = 200;
let identityStatus = 200;
let identityBody = JSON.stringify({ user: { id: "cashier-1", storeId: "store-1" } });
const permissions = buildDefaultRolePermissions();

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<!doctype html><title>Online fixture</title>");
      return;
    }
    if (url.pathname === "/api/auth/me") {
      response.writeHead(identityStatus, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(identityBody);
      return;
    }
    if (url.pathname === "/api/auth/permissions") {
      response.writeHead(permissionStatus, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ user: { id: "cashier-1", name: "Kasir", storeId: "store-1", role: "CASHIER" }, authorizationFingerprint: "0123456789abcdef", permissions }));
      return;
    }
    if (url.pathname === "/pos") {
      response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
      response.end(`<!doctype html><html><body><div hidden data-offline-pos-cashier="cashier-1" data-offline-pos-store="store-1"></div><span hidden data-offline-auth-user="cashier-1" data-offline-auth-store="store-1" data-offline-auth-role="CASHIER" data-offline-auth-fingerprint="${preparedFingerprint}" data-offline-auth-verified="true"></span><h1 id="offline-pos">Kasir siap</h1><script src="/_next/static/chunks/fixture.js"></script></body></html>`);
      return;
    }
    if (url.pathname === "/_next/static/chunks/fixture.js") {
      if (failPreparedAsset && request.headers["x-pos-offline-prepare"] === "1") {
        response.writeHead(503).end();
        return;
      }
      const contentType = invalidPreparedAssetMime && request.headers["x-pos-offline-prepare"] === "1" ? "application/json" : "text/javascript";
      response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
      response.end(`document.body.dataset.scriptReady = 'yes';
        const token = new URL(location.href).searchParams.get('__offline_prepare');
        if (token && parent !== window) parent.postMessage({type:'POS_OFFLINE_READY', token, cashierId:'cashier-1', storeId:'store-1', role:'CASHIER', authorizationFingerprint:'0123456789abcdef', permissions:${JSON.stringify(permissions)}, assets:['/_next/static/chunks/fixture.js']}, location.origin);`);
      return;
    }
    if (["/sw.js", "/offline.html", "/offline-vault.mjs", "/offline-unlock.mjs", "/offline-prepare.mjs", "/manifest.json"].includes(url.pathname)) {
      try {
        const body = await readFile(path.join(process.cwd(), "public", url.pathname.slice(1)));
        response.writeHead(200, { "Content-Type": url.pathname.endsWith(".html") ? "text/html" : url.pathname.endsWith(".json") ? "application/json" : "text/javascript" });
        response.end(body);
      } catch { response.writeHead(404).end(); }
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture server did not start");
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
}, 30_000);

afterAll(async () => {
  await browser?.close();
  if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

it("unlocks a prepared page and its static script after the browser goes offline", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.goto(baseUrl);
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await page.reload();
    await page.evaluate(`(async () => {
      const vault = await import('/offline-vault.mjs');
      const html = '<!doctype html><html><body><span hidden data-offline-auth-user="cashier-1" data-offline-auth-store="store-1" data-offline-auth-role="CASHIER" data-offline-auth-fingerprint="0123456789abcdef" data-offline-auth-verified="true"></span><h1 id="offline-pos">Kasir siap</h1><script src="/_next/static/chunks/fixture.js"></script></body></html>';
      const vaultGeneration = await vault.ensureOfflineGeneration('cashier-1', 'store-1');
      const saved = await vault.sealOfflinePage({ cashierId: 'cashier-1', storeId: 'store-1', role: 'CASHIER', authorizationFingerprint: '0123456789abcdef', revocationMarker: null, vaultGeneration, html, pin: '123456', preparedAt: new Date().toISOString() });
      await vault.saveOfflinePage(saved);
      const assets = await caches.open('pos-offline-static-v1');
      await assets.put('/_next/static/chunks/fixture.js', new Response('document.body.dataset.scriptReady="yes"', { headers: { 'Content-Type': 'text/javascript' } }));
    })()`);
    await context.setOffline(true);
    await page.goto(`${baseUrl}/pos`);
    await page.locator('input[name="pin"]').waitFor({ state: "visible", timeout: 8000 }).catch(async () => {
      throw new Error(`Offline form unavailable: ${await page.locator("#offline-status").textContent()}; ${errors.join("; ")}`);
    });
    await page.locator('input[name="pin"]').fill("123456");
    await page.getByRole("button", { name: "Buka POS offline" }).click();
    await page.locator("#offline-pos").waitFor();
    expect(await page.locator("#offline-pos").textContent()).toBe("Kasir siap");
    expect(await page.locator("body").getAttribute("data-script-ready")).toBe("yes");
    expect(await page.evaluate(() => (window as any).__posOfflineAuthorization)).toMatchObject({
      cashierId: "cashier-1", storeId: "store-1", role: "CASHIER", authorizationFingerprint: "0123456789abcdef",
    });
    expect(await page.evaluate(() => (window as any).__posOfflineAuthorization)).toBeUndefined();
  } finally {
    await context.close();
  }
}, 40_000);

it("does not reopen a vault after the server has revoked its access", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await page.reload();
    await page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
      const { revokeOfflineAccess } = await import('/offline-vault.mjs');
      revokeOfflineAccess('cashier-1', 'store-1');
    })()`);
    await context.setOffline(true);
    await page.goto(`${baseUrl}/pos`);
    await page.locator('input[name="pin"]').fill("123456");
    await page.getByRole("button", { name: "Buka POS offline" }).click();
    await expect.poll(() => page.locator("#offline-error").textContent()).toMatch(/akses|izin/i);
    expect(await page.locator("#offline-pos").count()).toBe(0);
    expect(await page.evaluate(() => (window as any).__posOfflineAuthorization)).toBeUndefined();
  } finally { await context.close(); }
}, 40_000);

it("rejects a PIN form opened before another tab revoked the vault without a writable marker", async () => {
  const context = await browser.newContext();
  const online = await context.newPage();
  const unlock = await context.newPage();
  try {
    await online.goto(baseUrl);
    await online.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await online.reload();
    await online.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
    })()`);
    await unlock.goto(`${baseUrl}/offline.html`);
    await expect.poll(() => unlock.locator('input[name="pin"]').isVisible()).toBe(true);
    await online.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("storage quota exceeded"); }; });
    permissionStatus = 403;
    await expect(online.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
    })()`)).rejects.toThrow();
    await unlock.locator('input[name="pin"]').fill("123456");
    await unlock.getByRole("button", { name: "Buka POS offline" }).click({ noWaitAfter: true, timeout: 5000 });
    await expect.poll(async () => await unlock.locator("#offline-error").count()
      ? unlock.locator("#offline-error").textContent({ timeout: 1000 })
      : "unlocked").toMatch(/akses|izin|akun/i);
    expect(await unlock.locator("#offline-pos").count()).toBe(0);
  } finally {
    permissionStatus = 200;
    await context.close();
  }
}, 40_000);

it("does not grant an offline session when the PIN is wrong", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await page.reload();
    await page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
    })()`);
    await context.setOffline(true);
    await page.goto(`${baseUrl}/pos`);
    await page.locator('input[name="pin"]').fill("654321");
    await page.getByRole("button", { name: "Buka POS offline" }).click();
    await expect.poll(() => page.locator("#offline-error").textContent()).toMatch(/PIN salah/i);
    expect(await page.evaluate(() => (window as any).__posOfflineAuthorization)).toBeUndefined();
  } finally { await context.close(); }
}, 40_000);

it("removes a revoked vault without removing a later verified preparation", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await page.reload();
    const result = await page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      const vault = await import('/offline-vault.mjs');
      const identity = { cashierId:'cashier-1', storeId:'store-1', pin:'123456' };
      await prepareOfflineAccess(identity);
      const marker = vault.revokeOfflineAccess(identity.cashierId, identity.storeId);
      await vault.removeRevokedOfflinePage(identity.cashierId, identity.storeId, marker);
      const afterRevoke = (await vault.listOfflinePages()).length;
      await prepareOfflineAccess(identity);
      await vault.removeRevokedOfflinePage(identity.cashierId, identity.storeId, marker);
      const remaining = await vault.listOfflinePages();
      return { afterRevoke, remaining: remaining.length, boundMarker: remaining[0]?.revocationMarker === marker };
    })()`);
    expect(result).toEqual({ afterRevoke: 0, remaining: 1, boundMarker: true });
  } finally { await context.close(); }
}, 40_000);

it("does not restore a vault when another tab revokes access during encryption", async () => {
  const context = await browser.newContext();
  const preparing = await context.newPage();
  const denying = await context.newPage();
  try {
    await preparing.goto(baseUrl);
    await preparing.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await preparing.reload();
    await denying.goto(baseUrl);
    await preparing.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
      const encrypt = crypto.subtle.encrypt.bind(crypto.subtle);
      Object.defineProperty(crypto.subtle, 'encrypt', { configurable: true, value: async (...args) => {
        await new Promise(resolve => { window.releaseEncryption = resolve; });
        return encrypt(...args);
      }});
    })()`);
    const pending = preparing.evaluate(`(async () => {
      try {
        const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
        await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
        return 'saved';
      } catch { return 'rejected'; }
    })()`);
    await preparing.waitForFunction(() => Boolean((window as any).releaseEncryption));
    await denying.evaluate(() => { Storage.prototype.setItem = () => { throw new Error("storage quota exceeded"); }; });
    permissionStatus = 403;
    await expect(denying.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
    })()`)).rejects.toThrow();
    await preparing.evaluate(() => (window as any).releaseEncryption());
    expect(await pending).toBe("rejected");
    expect(await preparing.evaluate(`(async () => (await (await import('/offline-vault.mjs')).listOfflinePages()).length)()`)).toBe(0);
  } finally {
    permissionStatus = 200;
    await context.close();
  }
}, 60_000);

it("broadcasts revocation again after the stored access has been removed", async () => {
  const context = await browser.newContext();
  const revoking = await context.newPage();
  const observer = await context.newPage();
  try {
    await revoking.goto(baseUrl);
    await observer.goto(baseUrl);
    await observer.evaluate(() => {
      (window as any).revocationMessages = [];
      const channel = new BroadcastChannel("pos:offline-access-revoked");
      channel.onmessage = (event) => (window as any).revocationMessages.push(event.data);
    });
    await revoking.evaluate(`(async () => {
      const vault = await import('/offline-vault.mjs');
      await vault.ensureOfflineGeneration('cashier-1', 'store-1');
      const request = indexedDB.open('pos-offline-access', 2);
      const db = await new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const tx = db.transaction('generations', 'readwrite');
      let held = true;
      window.releaseStorageLock = () => { held = false; };
      const keepAlive = () => { const read = tx.objectStore('generations').get('lock'); read.onsuccess = () => { if (held) keepAlive(); }; };
      tx.oncomplete = () => db.close();
      keepAlive();
      Storage.prototype.setItem = () => { throw new Error('storage quota exceeded'); };
    })()`);
    const pending = revoking.evaluate(`(async () => {
      const vault = await import('/offline-vault.mjs');
      await vault.invalidateOfflineAccess('cashier-1', 'store-1');
    })()`);
    await expect.poll(() => observer.evaluate(() => (window as any).revocationMessages.length)).toBe(1);
    await revoking.evaluate(() => (window as any).releaseStorageLock());
    await pending;
    await expect.poll(() => observer.evaluate(() => (window as any).revocationMessages.length)).toBe(2);
  } finally {
    await revoking.evaluate(() => (window as any).releaseStorageLock?.()).catch(() => undefined);
    await context.close();
  }
}, 40_000);

it("keeps the existing encrypted page when a replacement asset cannot be downloaded", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await page.reload();
    await page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
    })()`);
    failPreparedAsset = true;
    await expect(page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '654321' });
    })()`)).rejects.toThrow();
    const oldPage = await page.evaluate(`(async () => {
      const vault = await import('/offline-vault.mjs');
      return vault.openOfflinePage((await vault.listOfflinePages())[0], '123456');
    })()`);
    expect(oldPage).toContain('id="offline-pos"');
  } finally {
    failPreparedAsset = false;
    await context.close();
  }
}, 40_000);

it("refuses preparation when the fetched POS snapshot has a different permission fingerprint", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await page.reload();
    await page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
    })()`);
    preparedFingerprint = "fedcba9876543210";
    await expect(page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '654321' });
    })()`)).rejects.toThrow(/izin|identitas/i);
    await expect.poll(() => page.evaluate(`(async () => (await (await import('/offline-vault.mjs')).listOfflinePages()).length)()`)).toBe(0);
    expect(await page.evaluate(`(async () => (await import('/offline-vault.mjs')).readOfflineRevocation('cashier-1', 'store-1'))()`)).not.toBeNull();
  } finally {
    preparedFingerprint = "0123456789abcdef";
    await context.close();
  }
}, 40_000);

it("refuses preparation when the latest permissions endpoint denies access", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await page.reload();
    permissionStatus = 403;
    await expect(page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
    })()`)).rejects.toThrow(/izin|akses/i);
  } finally {
    permissionStatus = 200;
    await context.close();
  }
}, 40_000);

it.each([
  ["denied", 403, "{}"],
  ["different cashier", 200, JSON.stringify({ user: { id: "other", storeId: "store-1" } })],
  ["invalid identity data", 200, "{"],
])("revokes the old vault when the identity endpoint returns %s", async (_label, status, body) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await page.reload();
    await page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
    })()`);
    identityStatus = status;
    identityBody = body;
    await expect(page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
    })()`)).rejects.toThrow();
    await expect.poll(() => page.evaluate(`(async () => (await (await import('/offline-vault.mjs')).listOfflinePages()).length)()`)).toBe(0);
  } finally {
    identityStatus = 200;
    identityBody = JSON.stringify({ user: { id: "cashier-1", storeId: "store-1" } });
    await context.close();
  }
}, 40_000);

it("removes an old vault after access is denied even when the revocation marker cannot be written", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await page.reload();
    await page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
      Storage.prototype.setItem = () => { throw new Error('storage quota exceeded'); };
    })()`);
    permissionStatus = 403;
    await expect(page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
    })()`)).rejects.toThrow();
    await expect.poll(() => page.evaluate(`(async () => (await (await import('/offline-vault.mjs')).listOfflinePages()).length)()`)).toBe(0);
  } finally {
    permissionStatus = 200;
    await context.close();
  }
}, 40_000);

it("rejects a replacement script with an unusable content type and keeps the previous page", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await page.reload();
    await page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
    })()`);
    invalidPreparedAssetMime = true;
    await expect(page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '654321' });
    })()`)).rejects.toThrow();
    const oldPage = await page.evaluate(`(async () => {
      const vault = await import('/offline-vault.mjs');
      return vault.openOfflinePage((await vault.listOfflinePages())[0], '123456');
    })()`);
    expect(oldPage).toContain('id="offline-pos"');
  } finally {
    invalidPreparedAssetMime = false;
    await context.close();
  }
}, 40_000);

it("prepares the authenticated page and public assets before reopening offline", async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(baseUrl);
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await page.reload();
    await page.evaluate(`(async () => {
      const { prepareOfflineAccess } = await import('/offline-prepare.mjs');
      await prepareOfflineAccess({ cashierId: 'cashier-1', storeId: 'store-1', pin: '123456' });
    })()`);
    await context.setOffline(true);
    await page.goto(`${baseUrl}/pos`);
    await page.evaluate(`(() => {
      const send = ServiceWorker.prototype.postMessage;
      ServiceWorker.prototype.postMessage = function(message, ...rest) {
        if (message?.type === 'OFFLINE_UNLOCK') throw new Error('Worker state was discarded');
        return send.call(this, message, ...rest);
      };
    })()`);
    await page.locator('input[name="pin"]').fill("123456");
    await page.getByRole("button", { name: "Buka POS offline" }).click();
    await page.locator("#offline-pos").waitFor({ timeout: 5000 });
    expect(await page.locator("body").getAttribute("data-script-ready")).toBe("yes");
  } finally {
    await context.close();
  }
}, 40_000);
