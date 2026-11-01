import { createRequire } from "node:module";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe.skipIf(process.env.FINANCE_BROWSER_TEST !== "1")("isolasi identitas hutang pemasok", () => {
  let browser: Browser;
  let script: string;

  beforeAll(async () => {
    const requireFromVitest = createRequire(require.resolve("vitest/package.json"));
    const { build } = requireFromVitest("esbuild") as { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
    const bundle = await build({
      stdin: {
        contents: `
          import React, { useState } from 'react';
          import { createRoot } from 'react-dom/client';
          import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
          import { RoleProvider } from './components/providers/RoleProvider';
          import { SupplierPayablesPanel } from './features/keuangan/components/SupplierPayablesPanel';
          const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 300000 } } });
          window.version = 1;
          window.reads = 0;
          window.aborted = 0;
          window.holdNextGet = false;
          window.fetch = async (_url, options) => {
            if (options?.method === 'POST') return new Promise(resolve => {
              options.signal?.addEventListener('abort', () => window.aborted++);
              window.finishPost = () => resolve(new Response(JSON.stringify({ success: true }), { status: 200 }));
            });
            window.reads++;
            const old = window.version === 1;
            const response = new Response(JSON.stringify({ items: [{ id: old ? 'debt-old' : 'debt-new', supplierName: old ? 'Pemasok Rahasia' : 'Pemasok Baru', amount: 100000, paid: 0, debtDate: '2026-01-01', dueDate: null, note: 'Catatan' }], page: 1, total: 1 }), { status: 200 });
            if (window.holdNextGet) {
              window.holdNextGet = false;
              return new Promise(resolve => {
                options.signal?.addEventListener('abort', () => window.aborted++);
                window.finishGet = () => resolve(response);
              });
            }
            return response;
          };
          window.refresh = () => client.invalidateQueries({ queryKey: ['finance', 'supplier-payables'] });
          function App() {
            const [scope, setScope] = useState({ userId: 'user-1', storeId: 'store-1', fingerprint: 'auth-1', canCreate: true, canUpdate: true });
            window.changeIdentity = kind => {
              if (!kind.startsWith('permission')) window.version = 2;
              setScope(old => ({ ...old, ...(kind === 'store' ? { storeId: 'store-2' } : kind === 'user' ? { userId: 'user-2' } : kind === 'fingerprint' ? { fingerprint: 'auth-2' } : kind === 'permissionCreate' ? { canCreate: false } : { canUpdate: false }) }));
            };
            return <QueryClientProvider client={client}>
              <RoleProvider role="ADMIN" userId={scope.userId} userName="Pengguna" storeId={scope.storeId} authorizationFingerprint={scope.fingerprint}>
                <SupplierPayablesPanel canCreate={scope.canCreate} canUpdate={scope.canUpdate} />
              </RoleProvider>
            </QueryClientProvider>;
          }
          createRoot(document.getElementById('root')).render(<App />);
        `,
        resolveDir: process.cwd(), sourcefile: "supplier-payables-identity.tsx", loader: "tsx",
      },
      plugins: [{
        name: "supplier-payables-stubs",
        setup(pluginBuild: {
          onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }) => void;
          onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }) => void;
        }) {
          pluginBuild.onResolve({ filter: /^(lucide-react|@pos\/ui|\.\/GiroPanel)$/ }, args => ({ path: args.path, namespace: "panel-stub" }));
          pluginBuild.onLoad({ filter: /.*/, namespace: "panel-stub" }, args => ({
            contents: args.path === "lucide-react" ? "export const Plus = () => null; export const X = () => null;"
              : args.path === "@pos/ui" ? "import React from 'react'; export const Button = ({children, icon, variant, loading, ...props}) => <button {...props}>{children}</button>;"
                : "export const GiroPanel = () => null;",
            loader: "jsx", resolveDir: process.cwd(),
          }));
        },
      }],
      alias: { "@": process.cwd() }, jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife",
    });
    script = bundle.outputFiles[0].text;
    browser = await chromium.launch({ headless: true });
  }, 60_000);

  afterAll(async () => { await browser?.close(); }, 60_000);

  async function openPage() {
    const page = await browser.newPage();
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: script });
    await page.getByText("Pemasok Rahasia", { exact: true }).waitFor();
    return page;
  }

  async function changeIdentity(page: Awaited<ReturnType<typeof openPage>>, kind: string) {
    await page.evaluate(value => (window as unknown as { changeIdentity: (change: string) => void }).changeIdentity(value), kind);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  }

  it.each(["store", "user", "fingerprint"])("memisahkan cache saat %s berubah", async kind => {
    const page = await openPage();
    try {
      await changeIdentity(page, kind);
      await expect.poll(() => page.getByText("Pemasok Rahasia", { exact: true }).count(), { timeout: 1500 }).toBe(0);
      await expect.poll(() => page.getByText("Pemasok Baru", { exact: true }).count(), { timeout: 1500 }).toBe(1);
    } finally { await page.close(); }
  }, 15_000);

  it("membatalkan pembacaan tertunda dan mengabaikan data toko sebelumnya", async () => {
    const page = await openPage();
    try {
      await page.evaluate(() => {
        const state = window as unknown as { holdNextGet: boolean; refresh: () => Promise<void> };
        state.holdNextGet = true;
        void state.refresh();
      });
      await page.waitForFunction(() => Boolean((window as unknown as { finishGet?: () => void }).finishGet));
      await changeIdentity(page, "store");
      await expect.poll(() => page.evaluate(() => (window as unknown as { aborted: number }).aborted), { timeout: 1500 }).toBe(1);
      await page.getByText("Pemasok Baru", { exact: true }).waitFor();
      await page.evaluate(async () => {
        (window as unknown as { finishGet: () => void }).finishGet();
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      expect(await page.getByText("Pemasok Rahasia", { exact: true }).count()).toBe(0);
      expect(await page.getByText("Pemasok Baru", { exact: true }).count()).toBe(1);
    } finally { await page.close(); }
  }, 15_000);

  it.each([
    ["create", "store"], ["payment", "user"], ["create", "permissionCreate"], ["payment", "permissionUpdate"],
  ])("menutup dialog %s saat %s berubah", async (mode, kind) => {
    const page = await openPage();
    try {
      await page.getByRole("button", { name: mode === "create" ? "Tambahkan Hutang" : "Catat pembayaran", exact: true }).click();
      expect(await page.locator("dialog[open]").count()).toBe(1);
      await changeIdentity(page, kind);
      await expect.poll(() => page.locator("dialog[open]").count(), { timeout: 1500 }).toBe(0);
    } finally { await page.close(); }
  }, 15_000);

  it.each(["create", "payment"])("membatalkan permintaan %s yang masih menunggu saat pengguna berubah", async mode => {
    const page = await openPage();
    try {
      await page.getByRole("button", { name: mode === "create" ? "Tambahkan Hutang" : "Catat pembayaran", exact: true }).click();
      if (mode === "create") {
        await page.getByLabel("Nama pemasok", { exact: false }).fill("Pemasok");
        await page.getByLabel("Nominal hutang (Rp)", { exact: false }).fill("1000");
      } else {
        await page.getByLabel("Nominal pembayaran (Rp)").fill("1000");
      }
      await page.getByRole("button", { name: mode === "create" ? "Simpan hutang" : "Simpan pembayaran", exact: true }).click();
      await page.waitForFunction(() => Boolean((window as unknown as { finishPost?: () => void }).finishPost));
      await changeIdentity(page, "user");
      await expect.poll(() => page.evaluate(() => (window as unknown as { aborted: number }).aborted), { timeout: 1500 }).toBe(1);
      const reads = await page.evaluate(() => (window as unknown as { reads: number }).reads);
      await page.evaluate(async () => {
        (window as unknown as { finishPost: () => void }).finishPost();
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      expect(await page.evaluate(() => (window as unknown as { reads: number }).reads)).toBe(reads);
    } finally { await page.close(); }
  }, 15_000);
});
