import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";

describe("paginasi hutang pemasok", () => {
  it.skipIf(process.env.GIRO_BROWSER_TEST !== "1")("dapat kembali setelah hutang terakhir pada halaman kedua terhubung ke giro", async () => {
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
          const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
          let shrunk = false;
          const debt = (id) => ({id, supplierName:'Pemasok '+id, amount:1000, paid:0, debtDate:'2026-10-01', dueDate:null, note:null});
          window.fetch = async (url) => {
            if (url.startsWith('/api/finance/giro')) return new Response(JSON.stringify({items:[],manualPayables:[]}), {status:200});
            const page = Number(new URL(url, 'http://localhost').searchParams.get('page'));
            const items = page === 1 ? Array.from({length:20},(_,i)=>debt(String(i+1))) : shrunk ? [] : [debt('21')];
            return new Response(JSON.stringify({items,page,total:shrunk ? 20 : 21}), {status:200});
          };
          window.linkLastDebt = () => { shrunk = true; return client.invalidateQueries({queryKey:['finance','supplier-payables']}); };
          createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><RoleProvider role="OWNER" userId="user-1" userName="Pengguna" storeId="store-1" authorizationFingerprint="auth-1"><SupplierPayablesPanel canCreate={false} canUpdate={false}/></RoleProvider></QueryClientProvider>);
        `,
        resolveDir: process.cwd(), sourcefile: "supplier-payables-browser-harness.tsx", loader: "tsx",
      },
      plugins: [{
        name: "panel-dependency-stubs",
        setup(pluginBuild: {
          onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }) => void;
          onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }) => void;
        }) {
          pluginBuild.onResolve({ filter: /^(lucide-react|@pos\/ui|\.\/GiroPanel)$/ }, args => ({ path: args.path, namespace: "panel-stub" }));
          pluginBuild.onLoad({ filter: /.*/, namespace: "panel-stub" }, args => ({
            contents: args.path === "lucide-react"
              ? "export const Plus = () => null; export const X = () => null;"
              : args.path === "@pos/ui"
                ? "import React from 'react'; export const Button = ({children, icon, variant, ...props}) => <button {...props}>{children}</button>;"
                : "export const GiroPanel = () => null;",
            loader: "jsx",
            resolveDir: process.cwd(),
          }));
        },
      }],
      alias: { "@": process.cwd() }, jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife",
    });
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      page.setDefaultTimeout(5_000);
      await page.setContent('<div id="root"></div>');
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await page.getByText("Pemasok 20", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Berikutnya" }).click();
      await page.getByText("Pemasok 21", { exact: true }).waitFor();
      await page.evaluate(() => (window as unknown as { linkLastDebt: () => Promise<void> }).linkLastDebt());
      await page.getByText("Pemasok 21", { exact: true }).waitFor({ state: "detached" });
      expect(await page.getByRole("button", { name: "Sebelumnya" }).count()).toBe(1);
      expect(await page.getByText("Tidak ada hutang pada halaman ini.").count()).toBe(1);
      await page.getByRole("button", { name: "Sebelumnya" }).click();
      await page.getByText("Pemasok 20", { exact: true }).waitFor();
      expect(await page.getByText("Halaman 1").count()).toBe(0);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
