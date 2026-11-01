import { createRequire } from "node:module";
import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";

describe("cache kategori pengeluaran", () => {
  it.skipIf(process.env.FINANCE_BROWSER_TEST !== "1")("menampilkan kategori baru segera pada cache identitas yang benar", async () => {
    const requireFromVitest = createRequire(require.resolve("vitest/package.json"));
    const { build } = requireFromVitest("esbuild") as { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
    const bundle = await build({
      stdin: {
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
          import { RoleProvider } from './components/providers/RoleProvider';
          import { ExpenseFormModal } from './features/keuangan/components/ExpenseFormModal';
          const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
          const otherKey = ['finance','expense-categories','user-2','store-2','auth-2'];
          client.setQueryData(otherKey, {data:[{id:'other', name:'Toko lain'}]});
          let reads = 0;
          window.fetch = async (url, options) => {
            if (options?.method === 'POST') return new Response(JSON.stringify({data:{id:'new', name:'Kategori baru'}}), {status:200});
            if (reads++ === 0) return new Response(JSON.stringify({data:[{id:'old', name:'Kategori lama'}]}), {status:200});
            return new Promise(() => {});
          };
          window.readCategoryCache = () => ({
            current: client.getQueryData(['finance','expense-categories','user-1','store-1','auth-1']),
            other: client.getQueryData(otherKey),
          });
          createRoot(document.getElementById('root')).render(
            <QueryClientProvider client={client}>
              <RoleProvider role="ADMIN" userId="user-1" userName="Pengguna" storeId="store-1" authorizationFingerprint="auth-1">
                <ExpenseFormModal open mode="create" onClose={()=>{}} onSaved={()=>{}} canCreateCategory />
              </RoleProvider>
            </QueryClientProvider>
          );
        `,
        resolveDir: process.cwd(), sourcefile: "expense-category-cache-browser.tsx", loader: "tsx",
      },
      plugins: [{
        name: "modal-dependency-stubs",
        setup(pluginBuild: {
          onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }) => void;
          onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }) => void;
        }) {
          pluginBuild.onResolve({ filter: /^(lucide-react|@pos\/ui|@\/features\/proof-upload\/components\/ProofImageUploader)$/ }, args => ({ path: args.path, namespace: "modal-stub" }));
          pluginBuild.onLoad({ filter: /.*/, namespace: "modal-stub" }, args => ({
            contents: args.path === "lucide-react"
              ? "export const Check = () => null; export const Plus = () => null;"
              : args.path === "@pos/ui"
                ? "import React from 'react'; export const Modal = ({children}) => <div>{children}</div>; export const Button = ({children, loading, size, icon, variant, ...props}) => <button {...props}>{children}</button>;"
                : "export const ProofImageUploader = () => null; export const deleteUploadedProof = async () => {};",
            loader: "jsx", resolveDir: process.cwd(),
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
      await page.getByText("Kategori lama", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Tambah kategori" }).click();
      await page.getByLabel("Nama kategori baru").fill("Kategori baru");
      await page.getByRole("button", { name: "Simpan kategori" }).click();
      await page.getByText("Kategori baru", { exact: true }).waitFor();
      expect(await page.locator('input[value="custom:new"]').isChecked()).toBe(true);
      const cache = await page.evaluate(() => (window as unknown as { readCategoryCache: () => unknown }).readCategoryCache());
      expect(cache).toEqual({
        current: { data: [{ id: "new", name: "Kategori baru" }, { id: "old", name: "Kategori lama" }] },
        other: { data: [{ id: "other", name: "Toko lain" }] },
      });
    } finally {
      await browser.close();
    }
  }, 60_000);

  it.skipIf(process.env.FINANCE_BROWSER_TEST !== "1")("menutup form lama saat toko berganti dan mengabaikan respons kategori tertunda", async () => {
    const requireFromVitest = createRequire(require.resolve("vitest/package.json"));
    const { build } = requireFromVitest("esbuild") as { build: (options: Record<string, unknown>) => Promise<{ outputFiles: { text: string }[] }> };
    const bundle = await build({
      stdin: {
        contents: `
          import React, { useState } from 'react';
          import { createRoot } from 'react-dom/client';
          import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
          import { RoleProvider } from './components/providers/RoleProvider';
          import { ExpenseFormModal } from './features/keuangan/components/ExpenseFormModal';
          const client = new QueryClient({defaultOptions:{queries:{retry:false}}});
          let finishPost;
          let requests = 0;
          window.fetch = async (url, options) => {
            if (options?.method === 'POST') { requests++; return new Promise(resolve => { finishPost = () => resolve(new Response(JSON.stringify({data:{id:'old-pending',name:'Dari toko lama'}}), {status:200})); }); }
            return new Response(JSON.stringify({data:[]}), {status:200});
          };
          window.finishOldCategory = () => finishPost();
          window.postCount = () => requests;
          window.currentCache = () => client.getQueryData(['finance','expense-categories','user-2','store-2','auth-2']);
          function App() {
            const [scope,setScope] = useState(1);
            const [open,setOpen] = useState(true);
            const [initial,setInitial] = useState(true);
            window.changeStore = () => setScope(2);
            window.reopen = () => { setInitial(false); setOpen(true); };
            return <QueryClientProvider client={client}>
              <RoleProvider role="ADMIN" userId={'user-'+scope} userName="Pengguna" storeId={'store-'+scope} authorizationFingerprint={'auth-'+scope}>
                {open && <ExpenseFormModal open mode={initial ? 'edit' : 'create'} initial={initial ? {id:'old-entry',applicantName:'Rahasia toko lama',category:'SUPPLIES',description:null,amount:100,changeAmount:0,occurredAt:'2026-11-01T00:00:00Z',transactionId:null,attachmentUrl:null} : undefined} onClose={()=>setOpen(false)} onSaved={()=>{}} canCreateCategory/>}
              </RoleProvider>
            </QueryClientProvider>;
          }
          createRoot(document.getElementById('root')).render(<App />);
        `,
        resolveDir: process.cwd(), sourcefile: "expense-category-identity-browser.tsx", loader: "tsx",
      },
      plugins: [{
        name: "modal-dependency-stubs",
        setup(pluginBuild: {
          onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string }) => void;
          onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }) => void;
        }) {
          pluginBuild.onResolve({ filter: /^(lucide-react|@pos\/ui|@\/features\/proof-upload\/components\/ProofImageUploader)$/ }, args => ({ path: args.path, namespace: "modal-stub" }));
          pluginBuild.onLoad({ filter: /.*/, namespace: "modal-stub" }, args => ({
            contents: args.path === "lucide-react"
              ? "export const Check = () => null; export const Plus = () => null;"
              : args.path === "@pos/ui"
                ? "import React from 'react'; export const Modal = ({children}) => <div>{children}</div>; export const Button = ({children, loading, size, icon, variant, ...props}) => <button {...props}>{children}</button>;"
                : "export const ProofImageUploader = () => null; export const deleteUploadedProof = async () => {};",
            loader: "jsx", resolveDir: process.cwd(),
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
      await expect.poll(() => page.locator("#expense-applicant").inputValue()).toBe("Rahasia toko lama");
      await page.getByRole("button", { name: "Tambah kategori" }).click();
      await page.getByLabel("Nama kategori baru").fill("Dari toko lama");
      await page.getByRole("button", { name: "Simpan kategori" }).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { postCount: () => number }).postCount())).toBe(1);
      await page.evaluate(() => (window as unknown as { changeStore: () => void }).changeStore());
      await page.locator("#expense-applicant").waitFor({ state: "detached" });
      await page.evaluate(() => (window as unknown as { reopen: () => void }).reopen());
      await page.locator("#expense-applicant").waitFor();
      expect(await page.locator("#expense-applicant").inputValue()).toBe("");
      await page.evaluate(() => (window as unknown as { finishOldCategory: () => void }).finishOldCategory());
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
      expect(await page.evaluate(() => (window as unknown as { currentCache: () => unknown }).currentCache())).toEqual({ data: [] });
      expect(await page.getByText("Dari toko lama", { exact: true }).count()).toBe(0);
      expect(await page.locator('input[value="SUPPLIES"]').isChecked()).toBe(true);
    } finally {
      await browser.close();
    }
  }, 60_000);
});
