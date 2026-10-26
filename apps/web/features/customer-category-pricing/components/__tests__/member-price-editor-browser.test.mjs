import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { bundleReactHarness, web } from "../../../product-stock-groups/__tests__/browser-harness.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {RoleProvider} from './components/providers/RoleProvider';
import PriceUpdateModal,{PosPriceQuickEditModal} from './components/inventory/PriceUpdateModal';
import ProductFormModal from './components/inventory/ProductFormModal';
import {EditProductModal} from './components/EditProductModal';
window.saved=[];window.memberCloseCount=0;
const initial={id:'pen',productId:'pen',cartLineId:'pen-line',lineType:'PRODUCT',name:'Pulpen contoh',sku:'PEN-CONTOH',price:10000,catalogPrice:10000,costPrice:7000,stock:location.search.includes('fractional-stock')?0.5:20,minStock:1,quantity:1,unit:'pcs',unitMultiplierToBase:1,stockGroup:null,category:{id:'pens',name:'Alat tulis'},categoryId:'pens',categoryName:'Alat tulis',hargaAgen:location.search.includes('legacy-zero')?0:location.search.includes('legacy-override')?10000:null,hargaDinas:location.search.includes('legacy-zero')?0:location.search.includes('legacy-override')?11000:null,isActive:true};
const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
function Harness(){const [product,setProduct]=useState(initial);window.refresh=()=>setProduct({...initial,price:12000,catalogPrice:12000});const mode=new URLSearchParams(location.search).get('mode');const onClose=()=>window.memberCloseCount++;return <RoleProvider role={location.search.includes('staff')?'CASHIER':'OWNER'} userId='fixture' userName='Contoh'><QueryClientProvider client={client}>{mode==='pos'?<PosPriceQuickEditModal open item={product} onClose={onClose} onSave={input=>window.saved.push(input)}/>:mode==='edit'?<ProductFormModal isOpen productId='pen' initialData={product} categories={[initial.category]} onClose={onClose}/>:mode==='legacy'?<EditProductModal open product={product} onClose={onClose}/>:<PriceUpdateModal isOpen product={product} onClose={onClose} onViewHistory={()=>{}}/>}</QueryClientProvider></RoleProvider>}
createRoot(document.getElementById('root')).render(<Harness/>);`, [
  "components/inventory/PriceUpdateModal.tsx",
  "components/inventory/ProductFormModal.tsx",
  "components/EditProductModal.tsx",
  "features/customer-category-pricing/components/MemberPriceField.tsx",
  "features/customer-category-pricing/components/MemberPricingGuidance.tsx",
  "features/customer-category-pricing/components/SpecialPriceBadge.tsx",
  "features/product-stock-groups/components/ProductPricingAction.tsx",
  "../../packages/ui/src/Modal.tsx",
  "../../packages/ui/src/Input.tsx",
  "../../packages/ui/src/Button.tsx",
]);

const browser = await chromium.launch({channel:"chrome",headless:true});
try {
  for (const [width, scenario] of [[375, "fractional-stock"], [375, "default"], [1280, "default"], [375, "legacy-zero"], [375, "legacy-override"], [375, "staff"], [375, "validation-cancel"]]) {
    const legacyZero = scenario === "legacy-zero";
    for (const mode of ["catalog", "pos", "edit", "legacy"]) {
      const page=await browser.newPage({viewport:{width,height:width===1280?1200:900}});
      const errors=[];
      page.on("pageerror",error=>errors.push(error.message));
      await page.route("http://localhost:3021/**", async route=>{
        const request=route.request();const url=new URL(request.url());
        if(url.pathname==="/fixture")return route.fulfill({contentType:"text/html",body:'<html lang="id"><body><script>window.process={env:{}};</script><div id="root"></div></body></html>'});
        if(request.method()==="GET")return route.fulfill({json:{data:url.pathname==="/api/categories"?[{id:"pens",name:"Alat tulis"}]:[]}});
        const payload=request.postDataJSON();
        assert.equal(url.pathname,"/api/products/pen");
        await page.evaluate(payload=>window.saved.push(payload),payload);
        return route.fulfill({json:{id:"pen",...payload}});
      });
      await page.goto(`http://localhost:3021/fixture?mode=${mode}&${scenario}`);
      await page.addStyleTag({content:bundle.css});await page.addScriptTag({content:bundle.script});
      const input=page.getByLabel("Harga Agen",{exact:true});
      await input.waitFor({timeout:6000}).catch(async cause=>{
        console.error({mode,width,errors,body:(await page.locator("body").innerText()).slice(0,1600)});
        throw cause;
      });
      const agen=page.getByRole("group",{name:"Pengaturan Harga Agen",exact:true});
      const dinas=page.getByRole("group",{name:"Pengaturan Harga Dinas",exact:true});
      const guidance=page.getByRole("link",{name:"Atur diskon / tambahan",exact:true});
      if (scenario === "staff") {
        assert.equal(await guidance.count(),0,"staff do not get an inaccessible Owner-only link");
        assert.equal(await page.getByText("Minta Owner mengatur diskon atau tambahan otomatis di Produk → Harga Khusus.",{exact:true}).count(),1);
      } else {
        assert.equal(await guidance.getAttribute("href"),"/products?tab=special-prices");
      }
      const save=page.getByRole("button",{name:mode==="edit"?"Simpan Produk":mode==="legacy"?"Simpan Perubahan":"Simpan Harga",exact:true});
      if (scenario === "legacy-override") {
        assert.equal(await input.inputValue(),"10000","old positive prices are kept even when equal to selling price");
        assert.equal(await agen.getByRole("img",{name:"Harga Khusus",exact:true}).count(),1);
        assert.equal(await dinas.getByLabel("Harga Dinas",{exact:true}).inputValue(),"11000");
        await page.evaluate(()=>window.refresh());
        assert.equal(await input.inputValue(),"10000");
        const reset=dinas.getByRole("button",{name:"Ikuti harga jual untuk Harga Dinas",exact:true});
        await reset.focus();await page.keyboard.press("Enter");
        assert.equal(await dinas.getByLabel("Harga Dinas",{exact:true}).inputValue(),"");
        assert.equal(await dinas.getByLabel("Harga Dinas",{exact:true}).getAttribute("placeholder"),"12000");
        assert.equal(await dinas.getByRole("img",{name:"Harga Khusus",exact:true}).count(),0);
        assert.equal(await input.inputValue(),"10000","resetting Dinas preserves Agen");
        await save.click();
        await page.waitForFunction(()=>window.memberCloseCount===1,{},{timeout:6000});
        const saved=await page.evaluate(()=>window.saved);
        assert.equal(saved.length,1);
        const payload=mode==="pos"?saved[0].masterUpdate:saved[0];
        assert.equal(payload.hargaDinas,null);
        if(mode==="edit"||mode==="legacy")assert.equal(payload.hargaAgen,10000);
        else assert.equal(Object.hasOwn(payload,"hargaAgen"),false,"unchanged explicit override is not rewritten");
        assert.equal(Object.hasOwn(payload,"price"),false);
        assert.deepEqual(errors,[]);
        console.log(`PASS ${mode} ${width}px: old equal-price override persists, Dinas keyboard reset and save`);
        await page.close();continue;
      }
      assert.equal(await input.inputValue(),"");
      assert.equal(await input.getAttribute("placeholder"),"10000","default shows current selling price without saving a fixed copy");
      assert.match(await agen.innerText(),/Mengikuti harga jual/);
      if (scenario === "validation-cancel") {
        for (const invalid of ["0","-1"]) {
          await input.fill(invalid);
          assert.equal(await input.evaluate(element=>element.checkValidity()),false);
          await save.click();
          assert.deepEqual(await page.evaluate(()=>window.saved),[],"invalid override does not reach the API");
          assert.equal(await page.evaluate(()=>window.memberCloseCount),0);
        }
        await input.fill("9000.50");
        assert.equal(await input.evaluate(element=>element.checkValidity()),true,"positive decimal overrides are supported");
        const reset=agen.getByRole("button",{name:"Ikuti harga jual untuk Harga Agen",exact:true});
        await reset.focus();await page.keyboard.press("Enter");
        assert.equal(await input.inputValue(),"");
        assert.equal(await agen.getByRole("img",{name:"Harga Khusus",exact:true}).count(),0);
        await page.getByRole("button",{name:"Batal",exact:true}).click();
        assert.equal(await page.evaluate(()=>window.memberCloseCount),1);
        assert.deepEqual(await page.evaluate(()=>window.saved),[],"cancelling does not save a reset or draft");
        assert.deepEqual(errors,[]);
        console.log(`PASS ${mode} ${width}px: invalid values blocked, decimal accepted, keyboard reset and cancel`);
        await page.close();continue;
      }
      await input.fill("9000");await dinas.getByLabel("Harga Dinas",{exact:true}).fill("11000");
      assert.equal(await agen.getByRole("img",{name:"Harga Khusus",exact:true}).count(),1);
      await page.evaluate(()=>window.refresh());
      assert.equal(await input.inputValue(),"9000","refresh preserves a manual override draft");
      await agen.getByRole("button",{name:"Ikuti harga jual untuk Harga Agen",exact:true}).click();
      assert.equal(await input.inputValue(),"");
      assert.equal(await input.getAttribute("placeholder"),"12000");
      assert.equal(await agen.getByRole("img",{name:"Harga Khusus",exact:true}).count(),0);
      assert.equal(await dinas.getByLabel("Harga Dinas",{exact:true}).inputValue(),"11000");
      assert.equal(await dinas.getByRole("img",{name:"Harga Khusus",exact:true}).count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"no mobile overflow");
      if(process.argv.includes("--capture")&&mode==="catalog"&&width===1280){
        const guideBox=await page.getByRole("dialog").locator("form > aside").boundingBox();
        const fieldsBox=await page.getByRole("dialog").locator("form > .grid").boundingBox();
        assert.ok(guideBox&&fieldsBox);
        await page.screenshot({path:path.join(web,"public/images/changelog/harga-agen-dinas-default-2026-10-26.png"),clip:{x:guideBox.x-4,y:guideBox.y-4,width:guideBox.width+8,height:fieldsBox.y+fieldsBox.height-guideBox.y+8}});
      }
      if(scenario==="fractional-stock"&&mode==="legacy") {
        const stock=page.getByLabel("Stok *",{exact:true});
        await stock.fill("0.75");
        assert.equal(await stock.evaluate(element=>element.checkValidity()),true,"fractional stock remains valid while editing");
        await stock.press("Enter");
      } else await save.click();
      await page.waitForFunction(()=>window.memberCloseCount===1,{},{timeout:6000});
      const [saved]=await page.evaluate(()=>window.saved);
      const payload=mode==="pos"?saved.masterUpdate:saved;
      assert.equal(payload.hargaDinas,11000);
      if(scenario==="fractional-stock"&&mode==="legacy")assert.equal(payload.stock,0.75,"editing member prices supports fractional stock");
      if(mode==="edit"||mode==="legacy"||legacyZero)assert.equal(payload.hargaAgen,null);
      else assert.equal(Object.hasOwn(payload,"hargaAgen"),false,"resetting an unchanged default does not write a price");
      assert.equal(Object.hasOwn(payload,"price"),false,"default UI does not write a copy of selling price");
      assert.deepEqual(errors,[]);
      console.log(`PASS ${mode} ${width}px ${scenario}: default, override, reset, refresh and payload`);
      await page.close();
    }
  }
} finally {await browser.close();}
