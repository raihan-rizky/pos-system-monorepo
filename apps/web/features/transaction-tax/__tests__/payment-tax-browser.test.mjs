import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import { web, repo, bundleReactHarness } from "../../product-stock-groups/__tests__/browser-harness.mjs";

const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("vitest")] }));
const { chromium } = require("@playwright/test");
const fixture = `
  import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
  import {PaymentModal} from './components/PaymentModal';
  const items=[{cartLineId:'p1',productId:'p1',lineType:'PRODUCT',name:'Produk contoh',price:100000,catalogPrice:100000,quantity:1,unit:'pcs'}];
  window.submissions=[];window.drafts=[];
  function App(){const [open,setOpen]=useState(true);return <><button onClick={()=>setOpen(true)}>Buka pembayaran</button><PaymentModal open={open} onClose={()=>setOpen(false)} items={items} subtotal={100000} onConfirm={data=>window.submissions.push(data)} onSaveDraft={data=>window.drafts.push(data)}/></>}
  createRoot(document.getElementById('root')).render(<App/>);
`;
const bundle = await build({
  stdin: { contents: fixture, resolveDir: web, loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "fixtures", setup(builder) {
    builder.onResolve({ filter: /^@\/(hooks\/(useCustomers|useSalespersons|useCustomerCategoryPricingRules)|components\/providers\/RoleProvider|features\/invoice-date\/hooks\/useServerClock|features\/pos-checkout\/hooks\/useCartCatalogPrices)$/ }, args => ({ path: args.path, namespace: "fixtures" }));
    builder.onLoad({ filter: /.*/, namespace: "fixtures" }, () => ({ contents: `
      const now=new Date('2026-10-18T03:00:00Z');
      export const useRole=()=>({role:'OWNER'});
      export const useSalespersons=()=>({data:[]});
      export const useCustomerCategoryPricingRules=()=>({data:[]});
      export const useCartCatalogPrices=items=>items;
      export const useCustomers=()=>({data:[{id:'c1',name:'Pelanggan contoh',type:'UMUM'}]});
      export const useCreateCustomer=()=>({mutateAsync:async()=>({id:'c1',name:'Pelanggan contoh'}),isPending:false});
      export const useServerClock=()=>({now,source:'TIMEAPI_IO',isLoading:false,lastSyncedAt:now.getTime()});
    `, loader: "js" }));
  } }],
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
const { css } = await bundleReactHarness("", ["components/PaymentModal.tsx", "features/pos-checkout/components/CustomerCheckoutSelect.tsx", "../../packages/ui/src/Modal.tsx", "../../packages/ui/src/Input.tsx", "../../packages/ui/src/Button.tsx"]);
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.setContent('<html lang="id"><body><div id="root"></div></body></html>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.addStyleTag({ content: css });
  const tax = page.getByLabel("Pajak (%)", { exact: true });
  await tax.waitFor({ timeout: 5000 });
  await tax.focus();assert.equal(await tax.evaluate(el=>el===document.activeElement),true);
  const confirm = page.getByRole("button", { name: "Konfirmasi Bayar", exact: true });
  await page.getByLabel("Diskon rupiah").fill("10000");
  await tax.fill("12.5");
  await page.getByRole("button", { name: "Uang Pas", exact: true }).click();
  await confirm.click();
  await page.waitForFunction(()=>window.submissions.length===1);
  const data=await page.evaluate(()=>window.submissions.at(-1));
  assert.equal(data.taxRate,12.5);assert.equal(data.amountPaid,101250);assert.equal(data.discount,10000);
  for(const invalid of ["-1","100.01","1.001",""]){await tax.fill(invalid);assert.equal(await confirm.isDisabled(),true,`reject ${invalid}`);}
  await tax.fill("100");await page.getByRole("button", {name:"Uang Pas",exact:true}).click();await confirm.click();
  await page.waitForFunction(()=>window.submissions.length===2);assert.equal(await page.evaluate(()=>window.submissions.at(-1).amountPaid),180000);
  await tax.fill("0.57");await page.getByRole("button", {name:"Uang Pas",exact:true}).click();await confirm.click();
  await page.waitForFunction(()=>window.submissions.length===3);assert.equal(await page.evaluate(()=>window.submissions.at(-1).amountPaid),90513);
  // A quotation continues to receive PPN in its own print modal.
  await page.getByRole("button", {name:"Faktur Sementara",exact:true}).click();
  await page.waitForFunction(()=>window.drafts.length===1);assert.equal(await page.evaluate(()=>window.drafts[0].taxRate),undefined);
  await page.getByRole("button", {name:"Batal",exact:true}).click();await page.getByRole("button", {name:"Buka pembayaran",exact:true}).click();
  assert.equal(await tax.inputValue(),"0","new checkout resets its tax rate");
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(200);
  const bounds=await tax.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390,"tax field fits a mobile screen");
  await fs.mkdir(path.join(repo,"output/playwright/tax-payment"),{recursive:true});
  await tax.scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(repo,"output/playwright/tax-payment/mobile.png")});
  await tax.fill("12.5");
  await fs.mkdir(path.join(web,"public/images/changelog"),{recursive:true});
  await tax.locator("..").screenshot({path:path.join(web,"public/images/changelog/pajak-pembayaran.png")});
  assert.deepEqual(errors,[]);
  process.stdout.write("PASS payment tax: discounted total, decimal/max rates, validation, submission, draft isolation, reset and mobile smoke\n");
} finally { await browser.close(); }
