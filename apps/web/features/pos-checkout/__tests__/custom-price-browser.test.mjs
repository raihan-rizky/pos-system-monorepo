import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { bundleReactHarness, web, repo } from "../../product-stock-groups/__tests__/browser-harness.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {PosPriceQuickEditModal} from './components/inventory/PriceUpdateModal';
import {CartSidebar} from './components/CartSidebar';
import {priceCartItemsForCheckout} from './features/pos-checkout/helpers/checkout-pricing';
const product={cartLineId:'mouse',lineType:'PRODUCT',productId:'mouse',name:'Alas Mouse Pad',price:13500,catalogPrice:13500,quantity:1,unit:'Bh',stock:10,costPrice:7000,categoryId:'office',categoryName:'Alat tulis'};
const policy={enabled:false,increment:500,threshold:50};
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
window.saved=[];
function App(){const [item,setItem]=useState(product);const [open,setOpen]=useState(true);const priced=priceCartItemsForCheckout({items:[item],customerType:'UMUM',role:'OWNER',pricingRules:[],manualPrices:{},specialPricingEnabled:false,roundingSettings:policy})[0];return <QueryClientProvider client={client}><main style={{width:'min(340px,100%)',height:680}}><CartSidebar items={[priced]} subtotal={priced.price} totalItems={1} canQuickEdit specialPricingEnabled={false} roundingSettings={policy} onEditPrice={()=>setOpen(true)} onUpdateQuantity={()=>{}} onRemoveItem={()=>{}} onClearCart={()=>setItem(product)} onCheckout={()=>{}}/><PosPriceQuickEditModal open={open} item={priced} roundingSettings={policy} onClose={()=>setOpen(false)} onSave={update=>{window.saved.push(update);setItem(current=>({...current,transactionPrice:update.transactionPrice,price:update.transactionPrice??current.catalogPrice}))}}/></main></QueryClientProvider>};createRoot(document.getElementById('root')).render(<App/>);
`, [
  "components/inventory/PriceUpdateModal.tsx", "components/CartSidebar.tsx",
  "features/pos-checkout/components/TransactionCustomPriceBadge.tsx",
  "../../packages/ui/src/Modal.tsx", "../../packages/ui/src/Button.tsx", "../../packages/ui/src/Input.tsx",
]);

const browser = await chromium.launch({ channel: "chrome", headless: true });
await fs.mkdir(path.join(repo,"output/custom-price-browser"), {recursive:true});
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport:{width,height:900}, isMobile:width<600, hasTouch:width<600 });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors=[]; const writes=[];
    page.on("pageerror", error=>{ errors.push(error.message); console.error("Browser error:", error.message); });
    await page.route("**/api/**", async route=>{
      if(route.request().method()!=="GET") writes.push(route.request().url());
      await route.fulfill({status:200,contentType:"application/json",body:'{"data":[]}'});
    });
    await page.setContent('<html lang="id"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div></body></html>');
    await page.addScriptTag({content:'window.process={env:{NODE_ENV:"production"}};'});
    await page.addStyleTag({content:bundle.css}); await page.addScriptTag({content:bundle.script});
    const dialog=page.getByRole("dialog",{name:"Ubah Harga Nota",exact:true});
    await dialog.waitFor();
    assert.equal(await dialog.getByRole("textbox",{name:"Harga custom per satuan"}).count(),1);
    assert.equal(await dialog.getByText("Harga master",{exact:true}).count(),0);
    assert.equal(await dialog.getByRole("button",{name:"Atur harga grup / Manual",exact:true}).count(),0);
    assert.equal(await dialog.getByLabel("Harga Agen",{exact:true}).count(),0);
    const input=dialog.getByRole("textbox",{name:"Harga custom per satuan"});
    for (const invalid of ["0", "-1", "abc"]) {
      await input.fill(invalid);
      await dialog.getByRole("button",{name:"Terapkan harga",exact:true}).click();
      assert.deepEqual(await page.evaluate(()=>window.saved),[],"invalid prices cannot be applied");
      assert.equal(await input.getAttribute("aria-invalid"),"true");
    }
    await input.fill("9000");
    await dialog.getByRole("button",{name:"Batal",exact:true}).click();
    await dialog.waitFor({state:"detached"});
    assert.deepEqual(await page.evaluate(()=>window.saved),[],"cancel does not save the price");
    await page.getByRole("button",{name:"Ubah harga produk Alas Mouse Pad",exact:true}).click();
    await dialog.waitFor();
    assert.equal(await input.inputValue(),"13500","cancelled price is discarded");
    await input.fill("12000");
    await dialog.getByRole("button",{name:"Terapkan harga",exact:true}).click();
    await dialog.waitFor({state:"detached"});
    assert.deepEqual(await page.evaluate(()=>window.saved),[{transactionPrice:12000}]);
    await page.getByText("Harga custom",{exact:true}).waitFor();
    assert.equal(await page.getByText("Rp 12.000",{exact:true}).count()>0,true);
    assert.equal(await page.getByText("Harga Khusus nonaktif; transaksi memakai harga normal.",{exact:true}).count(),0);
    await page.getByRole("button",{name:"Ubah harga produk Alas Mouse Pad",exact:true}).click();
    await dialog.waitFor();
    assert.equal(await input.inputValue(),"12000");
    assert.equal(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth),true,"dialog must fit mobile width");
    await input.blur();
    await dialog.screenshot({path:path.join(repo,"output/custom-price-browser",`dialog-${width}.png`)});
    if(width===1280) await dialog.screenshot({path:path.join(web,"public/images/changelog/harga-custom-nota.png")});
    await dialog.getByRole("button",{name:"Kembalikan harga otomatis",exact:true}).focus();
    await page.keyboard.press("Enter");
    await dialog.waitFor({state:"detached"});
    assert.deepEqual(await page.evaluate(()=>window.saved.at(-1)),{transactionPrice:null});
    assert.equal(await page.getByText("Harga custom",{exact:true}).count(),0);
    assert.deepEqual(writes,[],"the cart price editor must not write master product prices");
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log("PASS: custom price applies only to this invoice, reset restores automatic price; mobile and desktop fit; no product writes.");
} finally {await browser.close();}
