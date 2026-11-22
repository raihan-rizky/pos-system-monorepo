import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";

describe("kategori hutang pemasok", () => {
  it.skipIf(process.env.GIRO_BROWSER_TEST !== "1")("meminta kategori dan mengirimkannya saat menyimpan hutang", async () => {
    const requireFromVitest = createRequire(require.resolve("vitest/package.json"));
    const { build } = requireFromVitest("esbuild") as { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
    const bundle = await build({
      stdin: {
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
          import { RoleProvider } from './components/providers/RoleProvider';
          import { SupplierPayablesPanel } from './features/keuangan/components/SupplierPayablesPanel';
          window.saved = null;
          let attemptState = { version: '0', attempt: null };
          window.fetch = async (url, options) => {
            if (String(url).endsWith('/manual-attempt')) {
              if (options?.method === 'POST') { const value = JSON.parse(options.body); attemptState = { version: 'next', attempt: { key: value.key, body: JSON.stringify(value.body), completedAt: null } }; }
              if (options?.method === 'DELETE') attemptState = { version: 'done', attempt: null };
              return new Response(JSON.stringify(attemptState), { status: 200 });
            }
            if (options?.method === 'POST' || options?.method === 'PATCH') { window.saved = { url, method: options.method, body: JSON.parse(options.body), key: options.headers?.['Idempotency-Key'] }; return new Response('{}', { status: 201 }); }
            return new Response(JSON.stringify({ items: [{ id: 'old', supplierName: 'Pemasok lama', amount: 1500, paid: 500, debtDate: '2026-10-01', dueDate: null, note: null, reportCategory: null, payments: [{ id: 'old-payment', amount: 500, paidAt: '2026-10-05', origin: 'MANUAL' }] }], page: 1, total: 1 }), { status: 200 });
          };
          const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
          createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><RoleProvider role="OWNER" userId="user-1" userName="Pengguna" storeId="store-1" authorizationFingerprint="auth-1"><SupplierPayablesPanel canCreate canUpdate canEdit canEditPayment canReadGiro={false} /></RoleProvider></QueryClientProvider>);
        `,
        resolveDir: process.cwd(), sourcefile: "supplier-payables-category.tsx", loader: "tsx",
      },
      plugins: [{
        name: "panel-stubs",
        setup(pluginBuild: any) {
          pluginBuild.onResolve({ filter: /^(lucide-react|@pos\/ui|\.\/GiroPanel)$/ }, (args: { path: string }) => ({ path: args.path, namespace: "stub" }));
          pluginBuild.onLoad({ filter: /.*/, namespace: "stub" }, (args: { path: string }) => ({
            contents: args.path === "lucide-react" ? "export const Plus = () => null; export const X = () => null;" : args.path === "@pos/ui" ? "import React from 'react'; export const Button = ({children, icon, variant, loading, ...props}) => <button {...props}>{children}</button>;" : "export const GiroPanel = () => null;",
            loader: "jsx", resolveDir: process.cwd(),
          }));
        },
      }],
      alias: { "@": process.cwd() }, jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife",
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      page.setDefaultTimeout(5_000);
      await page.route("http://localhost:9999/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
      await page.goto("http://localhost:9999/");
      await page.evaluate(() => Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true }));
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.getByText("Pemasok lama").waitFor();
      expect(await page.getByText("Belum berkategori").count()).toBe(1);
      await page.getByRole("button", { name: "Ubah hutang" }).click();
      await page.getByLabel("Kategori laporan").selectOption("SPANDUK");
      await page.getByLabel("Nominal hutang (Rp)").fill("2000");
      await page.getByRole("button", { name: "Simpan perubahan" }).click();
      await page.waitForFunction(() => (window as any).saved !== null);
      expect(await page.evaluate(() => (window as any).saved)).toMatchObject({ method: "PATCH", body: { amount: "2000", reportCategory: "SPANDUK" } });
      await page.evaluate(() => { (window as any).saved = null; });
      await page.getByText("Riwayat pembayaran").click();
      await page.getByRole("button", { name: "Ubah pembayaran" }).click();
      await page.getByLabel("Nominal pembayaran (Rp)").fill("400");
      await page.getByLabel("Tanggal pembayaran").fill("2026-10-06");
      await page.getByRole("button", { name: "Simpan perubahan" }).click();
      await page.waitForFunction(() => (window as any).saved !== null);
      expect(await page.evaluate(() => (window as any).saved)).toMatchObject({ url: "/api/finance/supplier-payables/old/payments/old-payment", method: "PATCH", body: { amount: "400", paidAt: "2026-10-06" } });
      await page.evaluate(() => { (window as any).saved = null; });
      await page.getByRole("button", { name: "Tambahkan Hutang" }).click();
      await page.getByLabel("Nama pemasok").fill("Pemasok contoh");
      await page.getByLabel("Nominal hutang (Rp)").fill("1000");
      const category = page.getByLabel("Kategori laporan");
      expect(await category.getAttribute("required")).not.toBeNull();
      expect(await category.locator("option").allTextContents()).toEqual(["Pilih kategori", "Cetak / Plat", "Spanduk", "ATK", "Gaji / Mingguan"]);
      await page.getByRole("button", { name: "Simpan hutang" }).click();
      expect(await page.evaluate(() => (window as any).saved)).toBeNull();
      await category.selectOption("ATK");
      await page.getByRole("button", { name: "Simpan hutang" }).click();
      await page.waitForFunction(() => (window as any).saved !== null);
      expect(await page.evaluate(() => (window as any).saved)).toMatchObject({ method: "POST", body: { reportCategory: "ATK" } });
      expect(await page.evaluate(() => (window as any).saved.key)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
