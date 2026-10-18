import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import path from "node:path";

const appRoot = process.cwd();
let server: Server;
let baseURL: string;

test.beforeAll(async () => {
  const localRequire = createRequire(path.join(appRoot, "package.json"));
  const { build } = localRequire(localRequire.resolve("esbuild", { paths: [path.resolve(appRoot, "../../node_modules/.pnpm/node_modules")] }));
  const postcss = localRequire("postcss");
  const tailwindcss = localRequire("tailwindcss");
  const entry = `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { ChangelogPage } from '@/features/changelog/components/ChangelogPage';
    import { WhatsNewPopup } from '@/features/changelog/components/WhatsNewPopup';
    createRoot(document.getElementById('root')).render(<React.StrictMode><ChangelogPage /><WhatsNewPopup /></React.StrictMode>);
  `;
  const bundle = await build({
    stdin: { contents: entry, loader: "tsx", resolveDir: appRoot },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    tsconfigRaw: { compilerOptions: { jsx: "react-jsx", baseUrl: appRoot, paths: { "@/*": ["./*"] } } },
    define: { "process.env.NODE_ENV": '"development"' },
    plugins: [{
      name: "changelog-browser-test-adapters",
      setup(plugin: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => unknown) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown) => void }) {
        plugin.onResolve({ filter: /RoleProvider$|^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: "test-adapter" }));
        plugin.onLoad({ filter: /.*/, namespace: "test-adapter" }, args => {
          let contents = "";
          if (args.path.endsWith("RoleProvider")) contents = `
          import {useState, useEffect} from 'react';
          const canAccess = path => window.__limitedRole ? path === '/changelog' : true;
          export function useRole() {
            const [userId,setUserId] = useState(window.__testUser ?? 'owner-1');
            useEffect(() => { const sync = () => setUserId(window.__testUser); window.addEventListener('test-user',sync); return () => window.removeEventListener('test-user',sync); }, []);
            return { userId, role:'OWNER', canAccess };
          }
          `;
          if (args.path === "next/navigation") contents = "export const usePathname = () => new URLSearchParams(location.search).has('popup') ? '/pos' : '/changelog';";
          if (args.path === "next/link") contents = "import {createElement} from 'react'; export default function Link({href,prefetch,...props}) { return createElement('a',{href,...props}); }";
          return { contents, loader: "js", resolveDir: appRoot };
        });
      },
    }],
  });
  const styles = await postcss([tailwindcss({ config: path.join(appRoot, "tailwind.config.ts") })]).process(await readFile(path.join(appRoot, "app/globals.css"), "utf8"), { from: path.join(appRoot, "app/globals.css") });
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname === "/entry.js") { response.setHeader("Content-Type", "text/javascript"); response.end(bundle.outputFiles[0].text); }
    else if (pathname === "/style.css") { response.setHeader("Content-Type", "text/css"); response.end(styles.css); }
    else if (/^\/images\/changelog\/[a-z0-9-]+\.webp$/.test(pathname)) {
      try { response.setHeader("Content-Type", "image/webp"); response.end(await readFile(path.join(appRoot, "public", pathname))); }
      catch { response.writeHead(404); response.end(); }
    } else {
      response.setHeader("Content-Type", "text/html");
      response.end('<!doctype html><html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/entry.js"></script></body></html>');
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Preview server did not start");
  baseURL = `http://127.0.0.1:${address.port}/`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-18T03:00:00Z"));
});

test("archive, compact weekly list, image zoom, keyboard focus, and mobile layout", async ({ page }) => {
  await page.goto(baseURL);
  await expect(page.getByRole("heading", { name: "Catatan Perubahan", exact: true })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(6);
  await page.getByRole("button", { name: "7 hari terakhir", exact: true }).click();
  await expect(page.getByRole("button", { name: "7 hari terakhir", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Sorotan 7 hari" }).click();
  const dialog = page.getByRole("dialog", { name: "Apa yang baru" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Tutup", exact: true })).toBeFocused();
  await expect(dialog.getByRole("list", { name: "Pembaruan 7 hari terakhir" }).getByRole("listitem")).toHaveCount(6);
  await expect(dialog.getByText("Pajak nota tersimpan", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Pengelolaan grup stok", { exact: true })).toBeVisible();
  await expect(dialog.locator("time")).toHaveCount(6);
  await expect(dialog.locator('time[datetime="2026-10-18"]').first()).toHaveText("18 Okt");
  await expect(dialog.locator('time[datetime="2026-10-14"]')).toHaveAttribute("title", "14 Oktober 2026");
  await expect(dialog.getByRole("button", { name: "Pembaruan berikutnya" })).toHaveCount(0);
  await expect(dialog.getByRole("link", { name: /Stok per satuan/ })).toHaveAttribute("href", "/pos");
  await expect(dialog.getByRole("button", { name: "Sudah lihat" })).toBeInViewport();
  const screenshotDir = process.env.CHANGELOG_SCREENSHOT_DIR;
  if (screenshotDir) {
    await mkdir(screenshotDir, { recursive: true });
    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(screenshotDir, "changelog-desktop-popup.png") });
  }
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Sorotan 7 hari" })).toBeFocused();
  await page.getByRole("button", { name: /Perbesar gambar: Stok/ }).click();
  const imageDialog = page.getByRole("dialog", { name: "Stok lebih jelas di setiap satuan." });
  await expect(imageDialog).toBeVisible();
  await expect(imageDialog.locator("img")).toHaveJSProperty("complete", true);
  await page.keyboard.press("Escape");
  await expect(imageDialog).not.toBeVisible();
  await page.locator("h1").click();
  if (screenshotDir) {
    await page.screenshot({ path: path.join(screenshotDir, "changelog-desktop.png"), fullPage: true });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator("h1")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Sorotan 7 hari" }).click();
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.getBoundingClientRect().right <= innerWidth && el.getBoundingClientRect().left >= 0)).toBe(true);
  await expect(dialog.getByRole("button", { name: "Sudah lihat" })).toBeInViewport();
  await expect(dialog.getByText("Pengelolaan grup stok", { exact: true })).toBeInViewport();
  if (screenshotDir) {
    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(screenshotDir, "changelog-mobile-popup.png") });
  }
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Sorotan 7 hari" }).click();
  await expect(dialog.getByRole("button", { name: "Sudah lihat" })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Tutup", exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 375, height: 480 });
  await expect(dialog.getByRole("button", { name: "Sudah lihat" })).toBeInViewport();
  await dialog.getByText("Pengelolaan grup stok", { exact: true }).scrollIntoViewIfNeeded();
  await expect(dialog.getByText("Pengelolaan grup stok", { exact: true })).toBeInViewport();
  await expect(dialog.getByRole("button", { name: "Sudah lihat" })).toBeInViewport();
  await dialog.getByRole("button", { name: "Sudah lihat" }).click();
  await expect(dialog).not.toBeVisible();
});

test("automatically opens once, persists dismissal per user, and supports a second user", async ({ page }) => {
  await page.goto(`${baseURL}?popup=1`);
  const dialog = page.getByRole("dialog", { name: "Apa yang baru" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Sudah lihat" }).click();
  await expect(dialog).not.toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("pos:changelog:seen:owner-1") ?? "[]").length)).toBe(6);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Catatan Perubahan", exact: true })).toBeVisible();
  await expect(dialog).not.toBeVisible({ timeout: 2500 });
  await page.evaluate(() => { Object.assign(window, { __testUser: "owner-2" }); window.dispatchEvent(new Event("test-user")); });
  await expect(dialog).toBeVisible();
});

test("keeps expired entries in archive and shows the weekly empty state after WIB rollover", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-25T00:00:00+07:00"));
  await page.goto(baseURL);
  await expect(page.locator("article")).toHaveCount(6);
  await page.getByRole("button", { name: "7 hari terakhir", exact: true }).click();
  await expect(page.getByText("Belum ada pembaruan dalam 7 hari terakhir", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Sorotan 7 hari" }).click();
  await expect(page.getByRole("dialog").getByText("Belum ada pembaruan dalam 7 hari terakhir", { exact: true })).toBeVisible();
});

test("survives denied storage and hides links to features the role cannot access", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { __limitedRole: true });
    Storage.prototype.getItem = () => { throw new DOMException("Blocked", "SecurityError"); };
    Storage.prototype.setItem = () => { throw new DOMException("Blocked", "SecurityError"); };
  });
  await page.goto(`${baseURL}?popup=1`);
  const dialog = page.getByRole("dialog", { name: "Apa yang baru" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("link").filter({ hasNotText: /Catatan Perubahan|Lihat semua catatan/ })).toHaveCount(0);
  await expect(dialog.getByText("Pajak nota tersimpan", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Sudah lihat" }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Sorotan 7 hari" }).click();
  await expect(dialog).toBeVisible();
});
