import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";

let server: Server;
let browser: Browser;
let baseUrl: string;
let failPreparedAsset = false;
let invalidPreparedAssetMime = false;

beforeAll(async () => {
  server = createServer(async (request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html" });
      response.end("<!doctype html><title>Online fixture</title>");
      return;
    }
    if (url.pathname === "/api/auth/me") {
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ user: { id: "cashier-1", storeId: "store-1" } }));
      return;
    }
    if (url.pathname === "/pos") {
      response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
      response.end('<!doctype html><html><body><div hidden data-offline-pos-cashier="cashier-1" data-offline-pos-store="store-1"></div><h1 id="offline-pos">Kasir siap</h1><script src="/_next/static/chunks/fixture.js"></script></body></html>');
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
        if (token && parent !== window) parent.postMessage({type:'POS_OFFLINE_READY', token, cashierId:'cashier-1', storeId:'store-1', assets:['/_next/static/chunks/fixture.js']}, location.origin);`);
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
  browser = await chromium.launch({ headless: true });
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
      const html = '<!doctype html><html><body><h1 id="offline-pos">Kasir siap</h1><script src="/_next/static/chunks/fixture.js"></script></body></html>';
      const saved = await vault.sealOfflinePage({ cashierId: 'cashier-1', storeId: 'store-1', html, pin: '123456', preparedAt: new Date().toISOString() });
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
  } finally {
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
