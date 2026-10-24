import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium, expect } = require("@playwright/test");
const bundle = await build({
  stdin: {
    contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { ShoppingRequestFinalApprovalModal } from './features/suppliers/shopping-requests/components/ShoppingRequestFinalApprovalModal';
      function App() {
        const [open, setOpen] = useState(true);
        return <><button onClick={() => setOpen(true)}>Buka persetujuan</button>
          <ShoppingRequestFinalApprovalModal requestId={open ? 'request-1' : null} onClose={() => setOpen(false)} /></>;
      }
      createRoot(document.getElementById('root')).render(<App />);
    `,
    resolveDir: web, sourcefile: "shopping-hpp-harness.tsx", loader: "tsx",
  },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "shopping-hpp-fixtures", setup(builder) {
    builder.onResolve({ filter: /useShoppingRequests$/ }, () => ({ path: "hooks", namespace: "fixture" }));
    builder.onResolve({ filter: /RoleProvider$/ }, () => ({ path: "role", namespace: "fixture" }));
    builder.onResolve({ filter: /\/(ProductAutocomplete|ShoppingRequestUnitSelect|ProductStockThumbnail)$/ }, args => ({ path: args.path.split("/").at(-1), namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => {
      const contents = args.path === "hooks" ? `
        const request = { id:'request-1', items:[{id:'item-1',productId:'paper',productName:'Kertas Contoh',productSku:'CONTOH-001',unit:'dus',requestedQty:1,imageUrl:null,product:{costPrice:1000,stockGroup:{id:'group-1'}}}] };
        export const useShoppingRequest = id => ({data:id ? request : null});
        export const useFinalizeShoppingRequest = () => ({isPending:false,mutateAsync:async payload => { window.savedHpp=payload.input; }});
        export const useRejectShoppingRequest = () => ({isPending:false,mutateAsync:async()=>{}});
      ` : args.path === "role" ? "export const useRole=()=>({canPerform:()=>true});"
        : args.path === "ProductAutocomplete" ? `
          import React from 'react';
          export const ProductAutocomplete=({onSelect})=><button type="button" onClick={()=>onSelect({id:'extra',name:'Barang Tambahan',sku:'EXTRA',unit:'pcs',costPrice:500})}>Tambah contoh</button>;
        ` : args.path === "ShoppingRequestUnitSelect" ? `
          import React from 'react';
          export const ShoppingRequestUnitSelect=({onChange})=><button type="button" onClick={()=>onChange({id:'paper-ream',name:'Kertas Contoh Rim',sku:'RIM',unit:'rim',stockGroupId:'group-1',costPrice:200})}>Ganti satuan contoh</button>;
        ` : "export const ProductStockThumbnail=()=>null;";
      return { contents, loader: "jsx", resolveDir: web };
    });
  } }],
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://localhost:3004/__shopping-hpp-fixture", route => route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' }));
  await page.goto("http://localhost:3004/__shopping-hpp-fixture");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const checkboxes = page.getByRole("checkbox", { name: "Perbarui HPP master ke harga beli ini", includeHidden: true });
  await expect(checkboxes).toHaveCount(1);
  await expect(checkboxes.first()).toBeChecked();
  await page.getByText("Pilihan HPP", { exact: true }).click();
  await checkboxes.first().uncheck();
  await page.getByLabel("Harga Beli", { exact: true }).fill("1200");
  await expect(checkboxes.first()).not.toBeChecked();
  const approve = page.getByRole("button", { name: "Setujui dan Catat Pembelian", exact: true });
  await approve.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.savedHpp.items[0].updateMasterHpp), false);

  await page.getByRole("button", { name: "Buka persetujuan" }).click();
  await expect(checkboxes.first()).toBeChecked();
  await page.getByText("Pilihan HPP", { exact: true }).click();
  await checkboxes.first().uncheck();
  await page.getByRole("button", { name: "Ganti satuan contoh" }).click();
  await expect(checkboxes.first()).toBeChecked();
  await page.getByRole("button", { name: "Tambah contoh" }).click();
  await expect(checkboxes).toHaveCount(2);
  await expect(checkboxes.nth(1)).toBeChecked();
  await approve.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  assert.equal(await page.evaluate(() => window.savedHpp.items[0].updateMasterHpp), true);
  assert.equal(await page.evaluate(() => window.savedHpp.extraItems[0].updateMasterHpp), true);
  assert.deepEqual(errors, []);
  process.stdout.write("PASS: HPP defaults checked on open, reopen, added products, and unit changes; opt-out survives price edits and submission; checked values are submitted.\n");
} finally {
  await browser.close();
}
