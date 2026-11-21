import { createRequire } from "node:module";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe.skipIf(process.env.FINANCE_BROWSER_TEST !== "1")("pemulihan pembayaran hutang manual", () => {
  let browser: Browser;
  let script: string;
  beforeAll(async () => {
    const requireFromVitest = createRequire(require.resolve("vitest/package.json"));
    const { build } = requireFromVitest("esbuild") as { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
    const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
      import React from 'react'; import { createRoot } from 'react-dom/client';
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      import { SupplierPayablesPanel } from './features/keuangan/components/SupplierPayablesPanel';
      window.clearWithoutEvent = () => localStorage.removeItem('giro-payment:' + JSON.stringify(['store-1','user-1','debt-1']));
      window.fetch = async (url, init) => {
        const db = JSON.parse(localStorage.getItem('test-db') || '{"paid":0,"requests":[],"lose":true}');
        if (init?.method === 'POST') {
          const data = JSON.parse(init.body); const key = init.headers['Idempotency-Key'];
          if (String(url).includes('?replay=1')) return db.key === key ? new Response(JSON.stringify({success:true}), {status:201}) : new Response(null, {status:404});
          db.requests.push({ key, ...data });
          if (key && db.key === key) { localStorage.setItem('test-db', JSON.stringify(db)); return new Response(JSON.stringify({success:true}), {status:201}); }
          if (data.expectedBalance !== undefined && Number(data.expectedBalance) !== 100000 - db.paid) { localStorage.setItem('test-db', JSON.stringify(db)); return new Response(JSON.stringify({message:'Saldo berubah.',code:'BalanceChanged'}), {status:409}); }
          db.key = key; db.paid += Number(data.amount); const lose = db.lose; db.lose = false;
          localStorage.setItem('test-db', JSON.stringify(db));
          if (lose) throw new TypeError('respons terputus');
          return new Response(JSON.stringify({success:true}), {status:201});
        }
        if (db.holdReads) return new Promise(() => {});
        if (String(url).endsWith('/finance/giro')) return new Response(JSON.stringify({items:db.hideGiro ? [] : [{goodsPurchaseId:'purchase',number:'G-1',supplierName:'Pemasok',amount:100000,debtDate:'2026-01-01',dueDate:null,payableId:'debt-1',status:db.paid >= 100000 ? 'PAID' : 'PARTIAL',paid:db.paid,remaining:100000-db.paid,payments:[]}],manualPayables:[]}),{status:200});
        return new Response(JSON.stringify({items:db.hidden ? [] : [{id:'debt-1',supplierName:'Pemasok',amount:100000,paid:db.paid,debtDate:'2026-01-01',dueDate:null,note:null,reportCategory:'ATK'}],page:1,total:db.hidden ? 21 : 1}), {status:200});
      };
      const access = JSON.parse(sessionStorage.getItem('test-permissions') || '{}');
      createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><SupplierPayablesPanel canRead={access.canRead ?? true} canCreate={access.canCreate ?? true} canUpdate={access.canUpdate ?? true} canReadGiro={access.canReadGiro ?? true} canUpdateGiro={access.canUpdateGiro ?? (access.canUpdate ?? true)} /></QueryClientProvider>);
    ` }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", alias: { "@": process.cwd() },
      plugins: [{ name: "boundaries", setup(b: {
        onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }) => void;
        onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { loader: string; resolveDir: string; contents: string }) => void;
      }) {
        b.onResolve({ filter: /^(lucide-react|@pos\/ui|\.\/GiroLinkDialog|@\/components\/providers\/RoleProvider)$/ }, (args: { path: string }) => ({ path: args.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (args: { path: string }) => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "lucide-react" ? "export const Plus=()=>null; export const X=()=>null;" : args.path === "@pos/ui" ? "import React from 'react'; export const Button=({children,icon,variant,loading,...props})=><button {...props}>{children}</button>;" : args.path.endsWith("RoleProvider") ? "export const useRole=()=>({userId:'user-1',storeId:'store-1',authorizationFingerprint:'a'});" : "export const GiroLinkDialog=()=>null; export const GiroLinkFields=()=>null;" }));
      } }],
    });
    script = bundle.outputFiles[0].text;
    browser = await chromium.launch({ channel: "chrome", headless: true });
  }, 60_000);
  afterAll(async () => { await browser?.close(); });
  it("memulihkan pembayaran lunas setelah respons hilang dan halaman dimuat ulang", async () => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const page = await context.newPage(); await page.goto("http://localhost:9999/"); await page.addScriptTag({ content: script });
    await page.getByRole("button", { name: "Catat pembayaran" }).first().click();
    await page.getByLabel("Nominal pembayaran (Rp)").fill("100000");
    await page.getByRole("button", { name: "Simpan pembayaran" }).click();
    await page.getByRole("alert").waitFor();
    const firstKey = await page.evaluate(() => JSON.parse(localStorage.getItem("test-db")!).requests[0].key);
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/);
    await page.reload(); await page.addScriptTag({ content: script });
    await page.getByRole("button", { name: "Pastikan pembayaran" }).first().click();
    expect(await page.getByLabel("Nominal pembayaran (Rp)").inputValue()).toBe("100000");
    await page.locator("dialog[open]").getByRole("button", { name: "Pastikan pembayaran", exact: true }).click();
    await expect.poll(() => page.locator("dialog[open]").count()).toBe(0);
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem("test-db")!));
    expect(state.paid).toBe(100000); expect(state.requests.map((row: { key: string }) => row.key)).toEqual([firstKey, firstKey]);
    await context.close();
  }, 30_000);
  it("menemukan pembayaran tertunda yang berpindah halaman setelah pembayaran dikoreksi", async () => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const page = await context.newPage(); await page.goto("http://localhost:9999/");
    const key = "b14f880a-fb50-43bc-a2aa-4733c8811dad";
    await page.evaluate(key => {
      localStorage.setItem("test-db", JSON.stringify({ paid: 70000, requests: [], key, lose: false, hidden: true }));
      localStorage.setItem(`giro-payment:${JSON.stringify(["store-1", "user-1", "debt-1"])}`, JSON.stringify({ key, amount: "100000", paidAt: "2026-01-10", expectedBalance: "100000" }));
    }, key);
    await page.addScriptTag({ content: script });
    await page.getByRole("button", { name: "Pastikan pembayaran" }).first().click();
    await page.locator("dialog[open]").getByRole("button", { name: "Pastikan pembayaran", exact: true }).click();
    await expect.poll(() => page.locator("dialog[open]").count()).toBe(0);
    expect(await page.evaluate(() => localStorage.getItem(`giro-payment:${JSON.stringify(["store-1", "user-1", "debt-1"])}`))).toBeNull();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("test-db")!).paid)).toBe(70000);
    await context.close();
  }, 30_000);
  it("menyinkronkan penyelesaian dari panel giro pada tab yang sama", async () => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const page = await context.newPage(); await page.goto("http://localhost:9999/");
    const key = "b14f880a-fb50-43bc-a2aa-4733c8811dad";
    await page.evaluate(key => { localStorage.setItem("test-db", JSON.stringify({ paid: 100000, requests: [], key, lose: false, hidden: true })); localStorage.setItem(`giro-payment:${JSON.stringify(["store-1", "user-1", "debt-1"])}`, JSON.stringify({ key, amount: "100000", paidAt: "2026-01-10", expectedBalance: "100000" })); }, key);
    await page.addScriptTag({ content: script });
    await expect.poll(() => page.getByRole("button", { name: "Pastikan pembayaran" }).count()).toBe(2);
    await page.locator('section[aria-labelledby="giro-title"]').getByRole("button", { name: "Pastikan pembayaran" }).click();
    await page.locator('dialog[open]').getByRole("button", { name: "Pastikan pembayaran" }).click();
    await expect.poll(() => page.getByRole("button", { name: "Pastikan pembayaran" }).count()).toBe(0);
    expect(await page.locator("dialog[open]").count()).toBe(0);
    await context.close();
  }, 30_000);
  it("tidak membuka formulir baru ketika key tertunda sudah hilang", async () => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const page = await context.newPage(); await page.goto("http://localhost:9999/");
    await page.evaluate(() => { localStorage.setItem("test-db", JSON.stringify({ paid: 100000, requests: [], lose: false, hidden: true })); localStorage.setItem(`giro-payment:${JSON.stringify(["store-1", "user-1", "debt-1"])}`, JSON.stringify({ key: "b14f880a-fb50-43bc-a2aa-4733c8811dad", amount: "100000", paidAt: "2026-01-10", expectedBalance: "100000" })); });
    await page.addScriptTag({ content: script });
    await page.getByRole("button", { name: "Pastikan pembayaran" }).first().waitFor();
    await page.evaluate(() => (window as any).clearWithoutEvent());
    await page.getByRole("button", { name: "Pastikan pembayaran" }).first().click();
    expect(await page.locator("dialog[open]").count()).toBe(0);
    await context.close();
  }, 30_000);
  it.each(["hutang", "giro"])("tidak mencatat ulang dari dialog %s setelah tab lain memastikan pembayaran", async panel => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const a = await context.newPage(); const b = await context.newPage();
    await a.goto("http://localhost:9999/");
    const key = "b14f880a-fb50-43bc-a2aa-4733c8811dad";
    await a.evaluate(key => {
      localStorage.setItem("test-db", JSON.stringify({ paid: 30000, requests: [], key, lose: false }));
      localStorage.setItem(`giro-payment:${JSON.stringify(["store-1", "user-1", "debt-1"])}`, JSON.stringify({ key, amount: "30000", paidAt: "2026-01-10", expectedBalance: "100000" }));
    }, key);
    await a.addScriptTag({ content: script });
    await b.goto("http://localhost:9999/"); await b.addScriptTag({ content: script });
    const section = panel === "giro" ? 'section[aria-labelledby="giro-title"]' : 'section[aria-labelledby="supplier-payables-title"]';
    await a.locator(section).getByRole("button", { name: "Pastikan pembayaran" }).first().click();
    await b.locator('section[aria-labelledby="supplier-payables-title"]').getByRole("button", { name: "Pastikan pembayaran" }).first().click();
    await b.locator("dialog[open]").getByRole("button", { name: "Pastikan pembayaran", exact: true }).click();
    await expect.poll(() => b.locator("dialog[open]").count()).toBe(0);
    await a.evaluate(() => { const db = JSON.parse(localStorage.getItem("test-db")!); db.paid = 0; localStorage.setItem("test-db", JSON.stringify(db)); });
    await a.locator("dialog[open]").getByRole("button", { name: "Pastikan pembayaran", exact: true }).click();
    await a.locator("dialog[open]").getByRole("alert").waitFor({ timeout: 4000 });
    const state = await a.evaluate(() => JSON.parse(localStorage.getItem("test-db")!));
    expect(state.paid).toBe(0);
    expect(state.requests.map((row: { key: string }) => row.key)).toEqual([key]);
    await context.close();
  }, 30_000);
  it.each(["hutang", "giro"])("menolak formulir %s yang dibuka sebelum pembayaran pada tab lain", async panel => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const a = await context.newPage(); const b = await context.newPage();
    await a.goto("http://localhost:9999/");
    await a.evaluate(() => localStorage.setItem("test-db", JSON.stringify({ paid: 0, requests: [], lose: false })));
    await a.addScriptTag({ content: script });
    await b.goto("http://localhost:9999/"); await b.addScriptTag({ content: script });
    const section = panel === "giro" ? 'section[aria-labelledby="giro-title"]' : 'section[aria-labelledby="supplier-payables-title"]';
    await a.locator(section).getByRole("button", { name: "Catat pembayaran" }).first().click();
    await b.locator('section[aria-labelledby="supplier-payables-title"]').getByRole("button", { name: "Catat pembayaran" }).first().click();
    for (const page of [a, b]) await page.locator("dialog[open]").getByLabel("Nominal pembayaran (Rp)").fill("30000");
    await b.locator("dialog[open]").getByRole("button", { name: "Simpan pembayaran", exact: true }).click();
    await expect.poll(() => b.locator("dialog[open]").count()).toBe(0);
    await a.evaluate(() => { const db = JSON.parse(localStorage.getItem("test-db")!); db.paid = 0; localStorage.setItem("test-db", JSON.stringify(db)); });
    await a.locator("dialog[open]").getByRole("button", { name: "Simpan pembayaran", exact: true }).click();
    await a.locator("dialog[open]").getByRole("alert").waitFor({ timeout: 4000 });
    const state = await a.evaluate(() => JSON.parse(localStorage.getItem("test-db")!));
    expect(state.paid).toBe(0);
    expect(state.requests).toHaveLength(1);
    await context.close();
  }, 30_000);
  it("menolak daftar lama meski formulir dibuka setelah pembayaran tab lain selesai", async () => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const a = await context.newPage(); const b = await context.newPage();
    await a.goto("http://localhost:9999/");
    await a.evaluate(() => localStorage.setItem("test-db", JSON.stringify({ paid: 0, requests: [], lose: false })));
    await a.addScriptTag({ content: script });
    await b.goto("http://localhost:9999/"); await b.addScriptTag({ content: script });
    await a.getByRole("button", { name: "Catat pembayaran" }).first().waitFor();
    await b.getByRole("button", { name: "Catat pembayaran" }).first().waitFor();
    await a.evaluate(() => { const db = JSON.parse(localStorage.getItem("test-db")!); db.holdReads = true; localStorage.setItem("test-db", JSON.stringify(db)); });
    await b.getByRole("button", { name: "Catat pembayaran" }).first().click();
    await b.locator("dialog[open]").getByLabel("Nominal pembayaran (Rp)").fill("30000");
    await b.locator("dialog[open]").getByRole("button", { name: "Simpan pembayaran", exact: true }).click();
    await expect.poll(async () => (await b.evaluate(() => JSON.parse(localStorage.getItem("test-db")!))).requests.length).toBe(1);
    await a.evaluate(() => { const db = JSON.parse(localStorage.getItem("test-db")!); db.paid = 0; localStorage.setItem("test-db", JSON.stringify(db)); });
    await a.getByRole("button", { name: "Catat pembayaran" }).first().click();
    await a.locator("dialog[open]").getByLabel("Nominal pembayaran (Rp)").fill("30000");
    await a.locator("dialog[open]").getByRole("button", { name: "Simpan pembayaran", exact: true }).click();
    await a.locator("dialog[open]").getByRole("alert").waitFor({ timeout: 4000 });
    expect(await a.evaluate(() => JSON.parse(localStorage.getItem("test-db")!).requests.length)).toBe(1);
    await context.close();
  }, 30_000);
  it("memakai kunci yang sama pada dua tab dan tidak mencatat pembayaran dua kali", async () => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const a = await context.newPage(); const b = await context.newPage();
    await a.goto("http://localhost:9999/"); await a.addScriptTag({ content: script });
    await b.goto("http://localhost:9999/"); await b.addScriptTag({ content: script });
    for (const page of [a, b]) {
      await page.getByRole("button", { name: "Catat pembayaran" }).first().click();
      await page.getByLabel("Nominal pembayaran (Rp)").fill("30000");
    }
    await a.getByRole("button", { name: "Simpan pembayaran" }).click();
    await a.getByRole("alert").waitFor();
    await b.getByRole("button", { name: "Simpan pembayaran" }).click();
    await expect.poll(() => b.locator("dialog[open]").count()).toBe(0);
    const state = await b.evaluate(() => JSON.parse(localStorage.getItem("test-db")!));
    expect(state.paid).toBe(30000);
    expect(state.requests).toHaveLength(2);
    expect(state.requests[0].key).toEqual(state.requests[1].key);
    await context.close();
  }, 30_000);
  it("memuat percobaan tab lain saat formulir berisi nominal berbeda", async () => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const a = await context.newPage(); const b = await context.newPage();
    await a.goto("http://localhost:9999/"); await a.addScriptTag({ content: script });
    await b.goto("http://localhost:9999/"); await b.addScriptTag({ content: script });
    for (const page of [a, b]) await page.getByRole("button", { name: "Catat pembayaran" }).first().click();
    await a.getByLabel("Nominal pembayaran (Rp)").fill("30000");
    await b.getByLabel("Nominal pembayaran (Rp)").fill("40000");
    await a.getByRole("button", { name: "Simpan pembayaran" }).click(); await a.getByRole("alert").waitFor();
    await b.getByRole("button", { name: "Simpan pembayaran" }).click(); await b.getByRole("alert").waitFor();
    expect(await b.getByLabel("Nominal pembayaran (Rp)").inputValue()).toBe("30000");
    await b.getByRole("button", { name: "Pastikan pembayaran", exact: true }).last().click();
    await expect.poll(() => b.locator("dialog[open]").count()).toBe(0);
    const state = await b.evaluate(() => JSON.parse(localStorage.getItem("test-db")!));
    expect(state.paid).toBe(30000); expect(state.requests).toHaveLength(2);
    expect(state.requests[0].key).toEqual(state.requests[1].key);
    await context.close();
  }, 30_000);
  it("menemukan dan memeriksa pembayaran sesi lama walau hutangnya tidak ada di daftar, tanpa membuat duplikat", async () => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const page = await context.newPage();
    const key = "b14f880a-fb50-43bc-a2aa-4733c8811dad";
    await page.goto("http://localhost:9999/");
    await page.evaluate(({ requestKey }) => {
      sessionStorage.setItem("giro-payment:debt-1", JSON.stringify({ key: requestKey, amount: "30000", paidAt: "2026-10-20" }));
      localStorage.setItem("test-db", JSON.stringify({ paid: 30000, requests: [{ key: requestKey, amount: "30000" }], key: null, lose: false, hidden: true, hideGiro: true }));
    }, { requestKey: key });
    await page.addScriptTag({ content: script });

    const panel = page.locator('section[aria-labelledby="supplier-payables-title"]');
    await panel.getByText("Akun dan toko asal tidak tercatat.").waitFor();
    const recover = panel.getByRole("button", { name: "Periksa pembayaran pada akun/toko ini" });
    expect(await recover.isDisabled()).toBe(true);
    await panel.getByLabel("Saya sudah memilih akun dan toko yang ingin diperiksa.").check();
    await recover.click();
    const dialog = page.locator("dialog[open]");
    await dialog.getByText("Pemeriksaan ini memakai kunci tersimpan dan tidak membuat pembayaran baru.").waitFor();
    await dialog.getByRole("button", { name: "Periksa pembayaran tersimpan" }).click();
    await dialog.getByRole("alert").waitFor();
    expect(await page.evaluate(() => sessionStorage.getItem("giro-payment:debt-1"))).not.toBeNull();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("test-db")!).requests)).toHaveLength(1);

    await page.evaluate(({ requestKey }) => { const db = JSON.parse(localStorage.getItem("test-db")!); db.key = requestKey; localStorage.setItem("test-db", JSON.stringify(db)); }, { requestKey: key });
    await dialog.getByRole("button", { name: "Periksa pembayaran tersimpan" }).click();
    await expect.poll(() => dialog.count()).toBe(0);
    expect(await page.evaluate(() => sessionStorage.getItem("giro-payment:debt-1"))).toBeNull();
    const state = await page.evaluate(() => JSON.parse(localStorage.getItem("test-db")!));
    expect(state.paid).toBe(30000);
    expect(state.requests).toHaveLength(1);
    await context.close();
  }, 30_000);
  it.each([
    { label: "hutang manual", resource: "MANUAL", access: { canRead: true, canCreate: true, canUpdate: true, canReadGiro: false, canUpdateGiro: false } },
    { label: "Giro", resource: "GIRO", access: { canRead: false, canCreate: false, canUpdate: false, canReadGiro: true, canUpdateGiro: true } },
  ])("menampilkan pemulihan catatan $label kepada peran dengan izin yang sesuai", async ({ resource, access }) => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const page = await context.newPage(); await page.goto("http://localhost:9999/");
    await page.evaluate(({ resource, access }) => {
      sessionStorage.setItem("test-permissions", JSON.stringify(access));
      sessionStorage.setItem("giro-payment:debt-1", JSON.stringify({ key: "b14f880a-fb50-43bc-a2aa-4733c8811dad", amount: "30000", paidAt: "2026-01-10", expectedBalance: "100000", resource }));
    }, { resource, access });
    await page.addScriptTag({ content: script });

    await expect.poll(() => page.getByRole("heading", { name: "Pembayaran dari sesi lama perlu diperiksa" }).count(), { timeout: 1500 }).toBe(1);
    await context.close();
  }, 30_000);
  it("menyembunyikan catatan tanpa jenis dan memblokir pembayaran giro sampai pengelola memeriksanya", async () => {
    const context = await browser.newContext();
    await context.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
    const page = await context.newPage(); await page.goto("http://localhost:9999/");
    await page.evaluate(() => {
      sessionStorage.setItem("test-permissions", JSON.stringify({ canRead: false, canCreate: false, canUpdate: false, canReadGiro: true, canUpdateGiro: true }));
      sessionStorage.setItem("giro-payment:debt-1", JSON.stringify({ key: "b14f880a-fb50-43bc-a2aa-4733c8811dad", amount: "30000", paidAt: "2026-01-10", expectedBalance: "100000" }));
    });
    await page.addScriptTag({ content: script });

    expect(await page.getByRole("heading", { name: "Pembayaran dari sesi lama perlu diperiksa" }).count()).toBe(0);
    await expect.poll(() => page.getByText(/Ada pembayaran lama yang belum dapat dikenali jenisnya\./).count(), { timeout: 1500 }).toBe(1);
    await expect.poll(() => page.getByText("Catatan pembayaran lama perlu diperiksa pada panel pemulihan sebelum mencatat pembayaran baru.").count(), { timeout: 1500 }).toBe(1);
    await context.close();
  }, 30_000);
});
