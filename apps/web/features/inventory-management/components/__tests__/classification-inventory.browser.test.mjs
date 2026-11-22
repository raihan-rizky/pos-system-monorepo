import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const bundle = await build({
  stdin: { resolveDir: web, loader: "tsx", contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {SingleStockUpdatePanel} from './features/inventory-management/components/SingleStockUpdatePanel';
    import {StockGroupBulkPanel} from './features/inventory-management/components/StockGroupBulkPanel';
    const client=new QueryClient({defaultOptions:{queries:{staleTime:Infinity}}});
    client.setQueryData(['product-classification','catalog'],{subcategories:[{id:'print',group:'PERCETAKAN',name:'PRINT',legacyCategoryId:null}],legacyCategories:[]});
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><SingleStockUpdatePanel/><StockGroupBulkPanel/></QueryClientProvider>);
  ` },
  bundle: true, write: false, outdir: "out", platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "products", setup(builder) {
    builder.onResolve({ filter: /^@\/hooks\/useProducts$/ }, () => ({ path: "products", namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
      export function useProducts(_search,_category,options){window.inventoryQueries[options.limit===12?'single':'bulk']=options;return {data:[],isFetching:false};}
    ` }));
  } }],
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent('<html lang="id"><body><div id="root"></div></body></html>');
  await page.evaluate(() => { window.inventoryQueries = {}; });
  await page.addScriptTag({ content: bundle.outputFiles.find((file) => file.path.endsWith(".js")).text });
  for (const panel of ["single", "bulk"]) {
    await page.locator(`#inventory-${panel}-catalog-group`).selectOption("PERCETAKAN");
    await page.locator(`#inventory-${panel}-catalog-subcategory`).selectOption("print");
    assert.deepEqual(await page.evaluate((name) => ({ ...window.inventoryQueries[name] }), panel), {
      limit: panel === "single" ? 12 : 20, catalogGroup: "PERCETAKAN", catalogSubcategoryId: "print",
    });
  }
  assert.equal(await page.getByText("Produk tidak ditemukan.").count(), 2);
  assert.deepEqual(errors, []);
  process.stdout.write("PASS inventory classification filtering on a narrow screen\n");
} finally { await browser.close(); }
