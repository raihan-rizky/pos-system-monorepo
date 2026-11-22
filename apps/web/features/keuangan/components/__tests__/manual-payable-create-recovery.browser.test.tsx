import { createRequire } from "node:module";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe.skipIf(process.env.FINANCE_BROWSER_TEST !== "1")("pemulihan pembuatan hutang", () => {
  let browser: Browser;
  let script: string;
  beforeAll(async () => {
    const requireFromVitest = createRequire(require.resolve("vitest/package.json"));
    const { build } = requireFromVitest("esbuild") as { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
    const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from 'react'; import { createRoot } from 'react-dom/client';
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      import { SupplierPayablesPanel } from './features/keuangan/components/SupplierPayablesPanel';
      window.fetch = async (url, init={}) => {
        const db = JSON.parse(localStorage.getItem('test-server') || '{"version":"0","attempt":null,"count":0,"payments":0,"lose":true}');
        const save = () => localStorage.setItem('test-server', JSON.stringify(db));
        const response = (value, status=200) => new Response(JSON.stringify(value), {status});
        if (String(url).endsWith('/manual-attempt')) {
          if (init.method === 'POST') {
            const {key,version,body} = JSON.parse(init.body);
            if (db.attempt || version !== db.version) return response({message:'Status berubah.',version:db.version,attempt:db.attempt},409);
            db.version = crypto.randomUUID(); db.attempt = {key,body:JSON.stringify(body),completedAt:null}; const loseRegister = db.loseRegister; db.loseRegister = false; save(); if (loseRegister) throw new TypeError('respons pendaftaran terputus');
          } else if (init.method === 'DELETE') {
            const {key,expectedCompleted} = JSON.parse(init.body);
            if (db.attempt && (key !== db.attempt.key || expectedCompleted !== Boolean(db.attempt.completedAt))) return response({message:'Status berubah.',version:db.version,attempt:db.attempt},409);
            db.version = crypto.randomUUID(); db.attempt = null; const loseAck = db.loseAck; db.loseAck = false; save(); if (loseAck) throw new TypeError('respons penyelesaian terputus');
          }
          return response({version:db.version,attempt:db.attempt});
        }
        if (init.method === 'POST') {
          const data = JSON.parse(init.body), key = init.headers['Idempotency-Key'];
          if (!db.attempt || db.attempt.key !== key) return response({message:'Percobaan berubah.'},409);
          if (!db.attempt.completedAt) { db.count++; if (Number(data.initialPayment)) db.payments++; db.attempt.completedAt = new Date().toISOString(); }
          const lose = db.lose; db.lose = false; save(); if (lose) throw new TypeError('respons terputus');
          return response({id:'debt-1'},201);
        }
        return response({items:[],page:1,total:0});
      };
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><SupplierPayablesPanel canCreate canUpdate /></QueryClientProvider>);
    ` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", alias: { "@": process.cwd() },
      plugins: [{ name: "boundaries", setup(b: { onResolve: Function; onLoad: Function }) {
        b.onResolve({ filter: /^(lucide-react|@pos\/ui|\.\/GiroPanel|@\/components\/providers\/RoleProvider)$/ }, (args: { path: string }) => ({ path: args.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (args: { path: string }) => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "lucide-react" ? "export const Plus=()=>null; export const X=()=>null;" : args.path === "@pos/ui" ? "import React from 'react'; export const Button=({children,icon,variant,loading,...props})=><button {...props}>{children}</button>;" : args.path.endsWith("RoleProvider") ? "export const useRole=()=>({userId:'user-1',storeId:'store-1',authorizationFingerprint:'a'});" : "export const GiroPanel=()=>null;" }));
      } }],
    });
    script = bundle.outputFiles[0].text;
    browser = await chromium.launch({ channel: "chrome", headless: true });
  }, 60_000);
  afterAll(async () => { await browser?.close(); });
  it("memulihkan hutang dan pembayaran awal yang responsnya hilang setelah reload", async () => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const page = await context.newPage(); await page.goto("http://localhost:9999/"); await page.addScriptTag({ content: script });
    await page.getByRole("button", { name: "Tambahkan Hutang" }).click();
    await page.getByLabel(/Nama pemasok/).fill("Pemasok"); await page.getByLabel(/Nominal hutang/).fill("1000");
    await page.getByLabel(/Kategori laporan/).selectOption("ATK"); await page.getByLabel(/Nominal pembayaran awal/).fill("300");
    await page.getByRole("button", { name: "Simpan hutang" }).click(); await page.getByRole("alert").waitFor();
    await page.reload(); await page.addScriptTag({ content: script });
    await page.getByRole("button", { name: "Periksa hutang sebelumnya" }).click();
    await page.getByRole("button", { name: "Selesai" }).click();
    await expect.poll(() => page.locator("dialog[open]").count()).toBe(0);
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem("test-server")!));
    expect(state.count).toBe(1); expect(state.payments).toBe(1); expect(state.attempt).toBeNull();
    await context.close();
  }, 30_000);
  it("menolak formulir tab lama setelah tab lain menyelesaikan hutang", async () => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const a = await context.newPage(), b = await context.newPage();
    for (const page of [a, b]) {
      await page.goto("http://localhost:9999/"); await page.addScriptTag({ content: script });
      await page.getByRole("button", { name: "Tambahkan Hutang" }).click();
      await page.getByLabel(/Nama pemasok/).fill("Pemasok"); await page.getByLabel(/Nominal hutang/).fill("1000");
      await page.getByLabel(/Kategori laporan/).selectOption("ATK"); await page.getByLabel(/Nominal pembayaran awal/).fill("300");
    }
    await a.getByRole("button", { name: "Simpan hutang" }).click(); await a.getByRole("alert").waitFor();
    await a.getByRole("button", { name: "Selesai" }).click();
    await expect.poll(() => a.locator("dialog[open]").count()).toBe(0);
    await b.getByRole("button", { name: "Simpan hutang" }).click(); await b.getByRole("alert").waitFor();
    const state = await b.evaluate(() => JSON.parse(localStorage.getItem("test-server")!));
    expect(state.count).toBe(1); expect(state.payments).toBe(1); expect(state.attempt).toBeNull();
    await context.close();
  }, 30_000);
  it("menutup formulir setelah respons penyelesaian hilang tanpa menawarkan penyimpanan ulang", async () => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const page = await context.newPage(); await page.goto("http://localhost:9999/");
    await page.evaluate(() => localStorage.setItem("test-server", JSON.stringify({ version: "0", attempt: null, count: 0, payments: 0, lose: false, loseAck: true })));
    await page.addScriptTag({ content: script }); await page.getByRole("button", { name: "Tambahkan Hutang" }).click();
    await page.getByLabel(/Nama pemasok/).fill("Pemasok"); await page.getByLabel(/Nominal hutang/).fill("1000");
    await page.getByLabel(/Kategori laporan/).selectOption("ATK"); await page.getByLabel(/Nominal pembayaran awal/).fill("300");
    await page.getByRole("button", { name: "Simpan hutang" }).click(); await page.getByRole("button", { name: "Selesai" }).click();
    await expect.poll(() => page.locator("dialog[open]").count()).toBe(0);
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem("test-server")!));
    expect(state.count).toBe(1); expect(state.payments).toBe(1); expect(state.attempt).toBeNull();
    await context.close();
  }, 30_000);
  it("melanjutkan kunci yang sama saat respons pendaftaran terputus", async () => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const page = await context.newPage(); await page.goto("http://localhost:9999/");
    await page.evaluate(() => localStorage.setItem("test-server", JSON.stringify({ version: "0", attempt: null, count: 0, payments: 0, lose: false, loseRegister: true })));
    await page.addScriptTag({ content: script }); await page.getByRole("button", { name: "Tambahkan Hutang" }).click();
    await page.getByLabel(/Nama pemasok/).fill("Pemasok"); await page.getByLabel(/Nominal hutang/).fill("1000");
    await page.getByLabel(/Kategori laporan/).selectOption("ATK"); await page.getByLabel(/Nominal pembayaran awal/).fill("300");
    await page.getByRole("button", { name: "Simpan hutang" }).click(); await page.getByRole("alert").waitFor();
    const key = await page.evaluate(() => JSON.parse(localStorage.getItem("test-server")!).attempt.key);
    await page.getByRole("button", { name: "Pastikan hutang" }).click(); await page.getByRole("button", { name: "Selesai" }).click();
    await expect.poll(() => page.locator("dialog[open]").count()).toBe(0);
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem("test-server")!));
    expect(key).toMatch(/^[0-9a-f-]{36}$/); expect(state.count).toBe(1); expect(state.payments).toBe(1);
    await context.close();
  }, 30_000);
});
