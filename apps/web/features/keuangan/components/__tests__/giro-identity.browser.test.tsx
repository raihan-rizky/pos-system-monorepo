import { createServer, type Server } from "node:http";
import { createRequire } from "node:module";
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe.skipIf(process.env.FINANCE_BROWSER_TEST !== "1")("isolasi identitas dialog giro", () => {
  let browser: Browser;
  let server: Server;
  let origin: string;
  let script: string;

  beforeAll(async () => {
    const requireFromVitest = createRequire(require.resolve("vitest/package.json"));
    const { build } = requireFromVitest("esbuild") as { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
    const bundle = await build({
      stdin: {
        contents: `
          import React, {useState} from 'react';
          import {createRoot} from 'react-dom/client';
          import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
          import {RoleProvider} from './components/providers/RoleProvider';
          import {GiroPanel} from './features/keuangan/components/GiroPanel';
          const client = new QueryClient({defaultOptions:{queries:{retry:false,staleTime:300000}}});
          const oldData = {items:[
            {goodsPurchaseId:'unknown',number:'GIRO-LAMA',supplierName:'Rahasia Toko Lama',amount:100000,debtDate:'2026-01-01',dueDate:'2026-11-20',payableId:null,status:'UNKNOWN',paid:null,remaining:null,payments:[]},
            {goodsPurchaseId:'known',number:'GIRO-TERCATAT',supplierName:'Pemasok Lama',amount:100000,debtDate:'2026-01-01',payableDebtDate:'2026-01-01',dueDate:'2026-11-20',payableId:'payable-old',status:'UNPAID',paid:0,remaining:100000,payments:[]}
          ],manualPayables:[{id:'manual-old',supplierName:'Hutang Rahasia',amount:100000,debtDate:'2026-01-01',dueDate:null,note:'Catatan rahasia',paid:0,payments:[]}]};
          const newData = {items:[{goodsPurchaseId:'new',number:'GIRO-BARU',supplierName:'Toko Baru',amount:50000,debtDate:'2026-01-01',dueDate:'2026-11-20',payableId:null,status:'UNKNOWN',paid:null,remaining:null,payments:[]}],manualPayables:[]};
          window.reads = 0;
          window.aborted = 0;
          window.currentVersion = 1;
          window.fetch = async (_url, options) => {
            if (options?.method === 'POST') return new Promise(resolve => {
              options.signal?.addEventListener('abort', () => window.aborted++);
              window.finishPost = () => resolve(new Response(JSON.stringify({code:'HistoryChanged', message:'Berubah'}), {status:409}));
            });
            window.reads++;
            return new Response(JSON.stringify(window.currentVersion === 1 ? oldData : newData), {status:200});
          };
          function App() {
            const [scope, setScope] = useState({userId:'user-1',storeId:'store-1',fingerprint:'auth-1',canUpdate:true});
            window.changeIdentity = kind => {
              if (kind !== 'permission') window.currentVersion = 2;
              setScope(old => ({...old,...(kind === 'store' ? {storeId:'store-2'} : kind === 'user' ? {userId:'user-2'} : kind === 'permission' ? {canUpdate:false} : {fingerprint:'auth-2'})}));
            };
            return <QueryClientProvider client={client}>
              <RoleProvider role="ADMIN" userId={scope.userId} userName="Pengguna" storeId={scope.storeId} authorizationFingerprint={scope.fingerprint}>
                <GiroPanel canUpdate={scope.canUpdate} />
              </RoleProvider>
            </QueryClientProvider>;
          }
          createRoot(document.getElementById('root')).render(<App />);
        `,
        resolveDir: process.cwd(), sourcefile: "giro-identity-browser.tsx", loader: "tsx",
      },
      plugins: [{
        name: "giro-dependency-stubs",
        setup(pluginBuild: {
          onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }) => void;
          onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }) => void;
        }) {
          pluginBuild.onResolve({ filter: /^(lucide-react|@pos\/ui|@\/lib\/utils)$/ }, args => ({ path: args.path, namespace: "giro-stub" }));
          pluginBuild.onLoad({ filter: /.*/, namespace: "giro-stub" }, args => ({
            contents: args.path === "lucide-react" ? "export const X = () => null;"
              : args.path === "@pos/ui" ? "import React from 'react'; export const Button = ({children, loading, ...props}) => <button {...props}>{children}</button>;"
                : "export const formatRupiah = value => 'Rp ' + value;",
            loader: "jsx", resolveDir: process.cwd(),
          }));
        },
      }],
      alias: { "@": process.cwd() }, jsx: "automatic", bundle: true, write: false, platform: "browser", format: "iife",
    });
    script = bundle.outputFiles[0].text;
    server = createServer((_request, response) => { response.writeHead(200, { "Content-Type": "text/html" }); response.end('<div id="root"></div>'); });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server unavailable");
    origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch({ headless: true });
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  }, 60_000);

  it.each([
    ["Periksa riwayat", "store"], ["Periksa riwayat", "user"], ["Periksa riwayat", "fingerprint"], ["Periksa riwayat", "permission"],
    ["Catat pembayaran", "store"], ["Catat pembayaran", "user"], ["Catat pembayaran", "fingerprint"], ["Catat pembayaran", "permission"],
    ["Hubungkan hutang manual", "store"], ["Hubungkan hutang manual", "user"], ["Hubungkan hutang manual", "fingerprint"], ["Hubungkan hutang manual", "permission"],
  ])("menutup %s saat %s berubah", async (action, change) => {
    const page = await browser.newPage();
    try {
      await page.goto(origin);
      await page.addScriptTag({ content: script });
      await page.getByRole("button", { name: action, exact: true }).click();
      expect(await page.locator("dialog[open]").count()).toBe(1);
      await page.evaluate(kind => (window as unknown as { changeIdentity: (value: string) => void }).changeIdentity(kind), change);
      if (change !== "permission") await page.getByText("GIRO-BARU", { exact: false }).waitFor();
      await expect.poll(() => page.locator("dialog[open]").count()).toBe(0);
    } finally { await page.close(); }
  }, 15_000);

  it.each(["review", "payment", "link"])("mengabaikan respons %s yang tiba setelah identitas berubah", async mode => {
    const page = await browser.newPage();
    try {
      await page.goto(origin);
      await page.addScriptTag({ content: script });
      if (mode === "review") {
        await page.getByRole("button", { name: "Periksa riwayat" }).click();
        await page.getByLabel("Saya memastikan riwayat pembayaran sudah lengkap").check();
        await page.getByRole("button", { name: "Simpan hasil pemeriksaan" }).click();
      } else if (mode === "payment") {
        await page.getByRole("button", { name: "Catat pembayaran" }).click();
        await page.getByLabel("Nominal pembayaran (Rp)").fill("30000");
        await page.getByRole("button", { name: "Simpan pembayaran" }).click();
      } else {
        await page.getByRole("button", { name: "Hubungkan hutang manual" }).click();
        await page.getByLabel("Hutang manual yang akan dihubungkan").selectOption("manual-old");
        await page.getByLabel("Saya sudah memeriksa kedua hutang dan riwayat pembayarannya.").check();
        await page.getByRole("button", { name: "Hubungkan hutang", exact: true }).click();
      }
      await page.waitForFunction(() => Boolean((window as unknown as { finishPost?: () => void }).finishPost));
      await page.evaluate(() => (window as unknown as { changeIdentity: (kind: string) => void }).changeIdentity("store"));
      await page.getByText("GIRO-BARU", { exact: false }).waitFor();
      expect(await page.evaluate(() => (window as unknown as { aborted: number }).aborted)).toBe(1);
      const before = await page.evaluate(() => (window as unknown as { reads: number }).reads);
      await page.evaluate(async () => {
        (window as unknown as { finishPost: () => void }).finishPost();
        await new Promise(resolve => setTimeout(resolve, 50));
      });
      expect(await page.evaluate(() => (window as unknown as { reads: number }).reads)).toBe(before);
      expect(await page.locator("dialog[open]").count()).toBe(0);
      if (mode === "payment") {
        const pending = await page.evaluate(() => localStorage.getItem(`giro-payment:${JSON.stringify(["store-1", "user-1", "payable-old"])}`));
        expect(pending).not.toBeNull();
      }
    } finally { await page.close(); }
  }, 15_000);
});
