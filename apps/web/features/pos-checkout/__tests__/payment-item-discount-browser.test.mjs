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
  const initial=[{cartLineId:'p1',productId:'p1',categoryId:'category-1',lineType:'PRODUCT',name:'Stiker contoh',price:10000,catalogPrice:10000,quantity:3,unit:'pcs'},{cartLineId:'p2',productId:'p2',lineType:'PRODUCT',name:'Kartu contoh',price:20000,catalogPrice:20000,quantity:2,unit:'pcs'}];
  window.submissions=[];window.drafts=[];
  function App(){const [open,setOpen]=useState(true);const [items,setItems]=useState(initial);window.setFixtureItems=setItems;return <><button onClick={()=>setOpen(true)}>Buka pembayaran</button><button onClick={()=>setItems(current=>current.filter(item=>item.cartLineId!=='p2'))}>Hapus kartu</button><button onClick={()=>setItems([])}>Kosongkan keranjang</button><PaymentModal initialCustomerSelection={{kind:'existing',customer:{id:'c1',name:'Pelanggan contoh',type:'INDUSTRI'}}} open={open} onClose={()=>setOpen(false)} items={items} subtotal={items.reduce((sum,item)=>sum+item.price*item.quantity,0)} onConfirm={data=>window.submissions.push(data)} onSaveDraft={data=>window.drafts.push(data)}/></>}
  createRoot(document.getElementById('root')).render(<App/>);
`;
const bundle = await build({
  stdin:{contents:fixture,resolveDir:web,loader:"tsx"},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",
  alias:{"@":web,"@pos/ui":path.join(repo,"packages/ui/src/index.ts")},define:{"process.env.NODE_ENV":'"production"'},
  plugins:[{name:"fixtures",setup(builder){
    builder.onResolve({filter:/^@\/(hooks\/(useCustomers|useSalespersons|useCustomerCategoryPricingRules)|components\/providers\/RoleProvider|features\/invoice-date\/hooks\/useServerClock|features\/pos-checkout\/hooks\/useCartCatalogPrices)$/},args=>({path:args.path,namespace:"fixtures"}));
    builder.onLoad({filter:/.*/,namespace:"fixtures"},()=>({contents:`
      const now=new Date('2026-10-19T03:00:00Z');
      export const useRole=()=>({role:'CASHIER'});export const useSalespersons=()=>({data:[]});export const useCustomerCategoryPricingRules=()=>({data:[]});export const useCartCatalogPrices=items=>items;
      export const useCustomers=()=>({data:[{id:'c1',name:'Pelanggan contoh',type:'UMUM'}]});export const useCreateCustomer=()=>({mutateAsync:async()=>({id:'c1',name:'Pelanggan contoh'}),isPending:false});export const useServerClock=()=>({now,source:'TIMEAPI_IO',isLoading:false,lastSyncedAt:now.getTime()});
    `,loader:"js",resolveDir:web}));
  }}],
});
const browser=await chromium.launch({channel:"chrome",headless:true});
const {css}=await bundleReactHarness("",["components/PaymentModal.tsx","features/pos-checkout/components/CustomerCheckoutSelect.tsx","../../packages/ui/src/Modal.tsx","../../packages/ui/src/Input.tsx","../../packages/ui/src/Button.tsx"]);
try {
  const page=await browser.newPage({viewport:{width:1200,height:1000}});page.setDefaultTimeout(7000);page.setDefaultNavigationTimeout(7000);const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.setContent('<html lang="id"><body><div id="root"></div></body></html>');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.addStyleTag({content:css});
  await page.getByLabel("Pajak (%)",{exact:true}).waitFor({timeout:5000});
  const confirm=page.getByRole("button",{name:"Konfirmasi Bayar",exact:true});
  const editStiker=page.getByRole("button",{name:"Diskon untuk Stiker contoh",exact:true});
  assert.equal(await editStiker.count(),1,"each checkout row offers an item discount button");
  const customPrice=page.getByLabel("Harga khusus untuk Stiker contoh",{exact:true});await customPrice.fill("-1");
  await page.getByText("Harga khusus tidak boleh negatif.",{exact:true}).waitFor();assert.equal(await confirm.isDisabled(),true,"negative custom prices remain editable without crashing");
  await customPrice.fill("10000");await page.getByRole("button",{name:"Pelanggan",exact:true}).click();await page.getByRole("option",{name:/Pelanggan Umum/}).click();
  process.stdout.write("mounted discount controls\n");
  await editStiker.click();
  const value=page.getByLabel("Nilai diskon item",{exact:true});const mode=page.getByLabel("Jenis diskon item",{exact:true});
  await value.fill("5000");await page.getByRole("button",{name:"Uang Pas",exact:true}).click();assert.equal(await confirm.isDisabled(),true,"unapplied item discount blocks checkout");
  await page.getByRole("button",{name:"Terapkan diskon",exact:true}).click();
  await page.getByLabel("Diskon rupiah",{exact:true}).fill("5000");await page.getByLabel("Pajak (%)",{exact:true}).fill("10");
  await page.getByRole("button",{name:"Uang Pas",exact:true}).click();await confirm.click();await page.waitForFunction(()=>window.submissions.length===1);
  process.stdout.write("individual submitted\n");
  let data=await page.evaluate(()=>window.submissions.at(-1));assert.equal(data.items[0].discount,5000);assert.equal(data.items[0].price,10000);assert.equal(data.amountPaid,66000);assert.equal(data.discount,5000);assert.equal(data.taxRate,10);
  await page.getByLabel("Pilih Stiker contoh untuk diskon",{exact:true}).focus();await page.keyboard.press("Space");assert.equal(await page.getByLabel("Pilih Stiker contoh untuk diskon",{exact:true}).isChecked(),true,"native checkbox works with keyboard");await page.getByLabel("Pilih Kartu contoh untuk diskon",{exact:true}).check();
  await page.getByRole("button",{name:"Diskon 2 item terpilih",exact:true}).click();await mode.selectOption("PERCENT");await value.fill("10");await page.getByRole("button",{name:"Terapkan diskon",exact:true}).click();
  await page.getByRole("button",{name:"Uang Pas",exact:true}).click();await confirm.click();await page.waitForFunction(()=>window.submissions.length===2);
  process.stdout.write("bulk submitted\n");
  data=await page.evaluate(()=>window.submissions.at(-1));assert.deepEqual(data.items.map(item=>item.discount),[3000,4000],"bulk percentage replaces previous discount on each gross row");assert.equal(data.amountPaid,63800);
  await page.getByRole("button",{name:"Diskon 2 item terpilih",exact:true}).click();await mode.selectOption("PERCENT");await value.fill("10");
  await fs.mkdir(path.join(web,"public/images/changelog"),{recursive:true});
  const summary=page.getByText("Ringkasan item",{exact:true}).locator("..");const editor=page.getByRole("region",{name:"Editor diskon item",exact:true});
  await summary.scrollIntoViewIfNeeded();const top=await summary.boundingBox();const bottom=await editor.boundingBox();
  await page.screenshot({path:path.join(web,"public/images/changelog/diskon-per-item.png"),clip:{x:top.x,y:top.y,width:top.width,height:bottom.y+bottom.height-top.y}});
  await page.getByRole("button",{name:"Batal diskon",exact:true}).click();
  await editStiker.click();
  for(const invalid of ["-1","100.01","1.001",""]){await value.fill(invalid);assert.equal(await page.getByRole("button",{name:"Terapkan diskon",exact:true}).isDisabled(),true,`reject ${invalid}`);}
  await mode.selectOption("RP");await value.fill("30000.01");assert.equal(await page.getByRole("button",{name:"Terapkan diskon",exact:true}).isDisabled(),true);
  await page.getByRole("button",{name:"Batal diskon",exact:true}).click();await page.getByRole("button",{name:"Hapus diskon untuk Stiker contoh",exact:true}).click();
  await page.getByRole("button",{name:"Faktur Sementara",exact:true}).click();await page.waitForFunction(()=>window.drafts.length===1);data=await page.evaluate(()=>window.drafts.at(-1));assert.equal(data.items[0].discount,0);assert.equal(data.items[1].discount,4000);
  await page.setViewportSize({width:390,height:844});await editStiker.click();await value.fill("5000");await value.scrollIntoViewIfNeeded();const bounds=await value.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=390,"editor fits mobile");
  await fs.mkdir(path.join(repo,"output/playwright/item-discount"),{recursive:true});await page.screenshot({path:path.join(repo,"output/playwright/item-discount/mobile.png")});
  await page.getByRole("button",{name:"Batal diskon",exact:true}).click();await page.getByRole("button",{name:"Batal",exact:true}).click();await page.getByRole("button",{name:"Buka pembayaran",exact:true}).click();
  assert.equal(await page.getByRole("button",{name:"Hapus diskon untuk Kartu contoh",exact:true}).count(),0,"closing clears item discount state");assert.equal(await page.getByLabel("Pilih Kartu contoh untuk diskon",{exact:true}).isChecked(),false);
  // A bulk rupiah value is deducted once per row, and cancel leaves it intact.
  await page.getByLabel("Pilih Stiker contoh untuk diskon",{exact:true}).check();
  await page.getByLabel("Pilih Kartu contoh untuk diskon",{exact:true}).check();
  await page.getByRole("button",{name:"Diskon 2 item terpilih",exact:true}).click();
  await mode.selectOption("RP");await value.fill("30000.01");
  assert.equal(await page.getByRole("button",{name:"Terapkan diskon",exact:true}).isDisabled(),true,"bulk rupiah cannot exceed the smallest selected row");
  await value.fill("5000");await page.getByRole("button",{name:"Terapkan diskon",exact:true}).click();
  await page.getByRole("button",{name:"Faktur Sementara",exact:true}).click();await page.waitForFunction(()=>window.drafts.length===2);
  data=await page.evaluate(()=>window.drafts.at(-1));assert.deepEqual(data.items.map(item=>item.discount),[5000,5000]);
  await editStiker.click();await value.fill("1000");
  assert.equal(await page.getByRole("button",{name:"Faktur Sementara",exact:true}).isDisabled(),true,"pending edits also block drafts");
  await page.getByRole("button",{name:"Batal diskon",exact:true}).click();
  await page.getByRole("button",{name:"Faktur Sementara",exact:true}).click();await page.waitForFunction(()=>window.drafts.length===3);
  data=await page.evaluate(()=>window.drafts.at(-1));assert.deepEqual(data.items.map(item=>item.discount),[5000,5000],"cancel does not change applied discounts");
  await page.getByRole("button",{name:"Diskon 2 item terpilih",exact:true}).click();await mode.selectOption("PERCENT");await value.fill("10");
  await page.getByRole("button",{name:"Terapkan diskon",exact:true}).click();
  await page.evaluate(()=>window.setFixtureItems(current=>current.map(item=>item.cartLineId==="p1"?{...item,price:5000,catalogPrice:5000}:item)));
  await page.getByRole("button",{name:"Faktur Sementara",exact:true}).click();await page.waitForFunction(()=>window.drafts.length===4);
  data=await page.evaluate(()=>window.drafts.at(-1));assert.deepEqual(data.items.map(item=>item.discount),[1500,4000],"percentages follow repricing");
  await page.evaluate(()=>window.setFixtureItems(current=>current.map(item=>item.cartLineId==="p1"?{...item,price:10000,catalogPrice:10000}:item)));
  await page.getByRole("button",{name:"Batal pilih",exact:true}).click();
  assert.equal(await page.getByLabel("Pilih Stiker contoh untuk diskon",{exact:true}).isChecked(),false);
  await page.getByLabel("Pilih Stiker contoh untuk diskon",{exact:true}).check();await page.getByLabel("Pilih Kartu contoh untuk diskon",{exact:true}).check();
  await page.getByRole("button",{name:"Diskon 2 item terpilih",exact:true}).click();await mode.selectOption("PERCENT");await value.fill("100");await page.getByRole("button",{name:"Terapkan diskon",exact:true}).click();
  await page.getByRole("button",{name:"Uang Pas",exact:true}).click();await confirm.click();await page.waitForFunction(()=>window.submissions.length===3);
  data=await page.evaluate(()=>window.submissions.at(-1));assert.equal(data.amountPaid,0);assert.deepEqual(data.items.map(item=>item.discount),[30000,40000]);
  await page.getByRole("button",{name:"Diskon 2 item terpilih",exact:true}).click();
  await page.evaluate(()=>window.setFixtureItems(current=>current.filter(item=>item.cartLineId!=="p2")));
  await page.getByRole("button",{name:"Diskon 1 item terpilih",exact:true}).waitFor();assert.equal(await page.getByRole("button",{name:"Diskon 2 item terpilih",exact:true}).count(),0,"removed cart rows leave no stale bulk selection");
  await page.evaluate(()=>window.setFixtureItems([]));await page.getByRole("region",{name:"Editor diskon item",exact:true}).waitFor({state:"detached"});
  assert.equal(await confirm.isDisabled(),true,"an empty cart cannot be paid");assert.equal(await page.getByRole("button",{name:"Faktur Sementara",exact:true}).isDisabled(),true,"an empty cart cannot be saved");
  // Same product ID in different cart rows must keep distinct manual discounts.
  await page.evaluate(()=>window.setFixtureItems([
    {cartLineId:"front",productId:"p1",lineType:"PRODUCT",name:"Kertas depan",price:1000,catalogPrice:1000,quantity:2,unit:"pcs"},
    {cartLineId:"back",productId:"p1",lineType:"PRODUCT",name:"Kertas belakang",price:1000,catalogPrice:1000,quantity:2,unit:"pcs"},
  ]));
  await page.getByRole("button",{name:"Diskon untuk Kertas depan",exact:true}).click();await mode.selectOption("RP");await value.fill("500");
  await page.getByRole("button",{name:"Terapkan diskon",exact:true}).click();
  await page.getByRole("button",{name:"Faktur Sementara",exact:true}).click();await page.waitForFunction(()=>window.drafts.length===5);
  data=await page.evaluate(()=>window.drafts.at(-1));assert.deepEqual(data.items.map(item=>item.discount),[500,0],"same-product rows have independent discounts");
  assert.deepEqual(errors,[]);process.stdout.write("PASS item discounts: individual Rp, bulk percentage replacement, net tax, validation, drafts, reset, bulk Rp, cancellation, repricing, same-product rows and mobile\n");
} finally {await browser.close();}
