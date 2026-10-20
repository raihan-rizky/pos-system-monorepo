import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFile,mkdir} from "node:fs/promises";
import path from "node:path";
import {web,repo} from "../../product-stock-groups/__tests__/browser-harness.mjs";
const require=createRequire(import.meta.url);
const {build}=require(require.resolve("esbuild",{paths:[require.resolve("vitest")]}));
const {chromium}=require("@playwright/test");
const entry=[
"import React,{useState} from 'react';",
"import {createRoot} from 'react-dom/client';",
"import {QueryClient,QueryClientProvider} from '@tanstack/react-query';",
"import {RoleProvider} from './components/providers/RoleProvider';",
"import {DraftReceiptModal} from './components/DraftReceiptModal';",
"const client=new QueryClient({defaultOptions:{queries:{retry:false}}});",
"const transaction={id:'draft-1',draftNumber:'PNW-TLD-20261019-001',status:'DRAFT',subtotal:22500,discount:0,tax:0,total:22500,items:[",
"{id:'item-1',productId:'p1',productName:'Amplop 110 PPL',quantity:1,unitPrice:22500,subtotal:22500,product:{unit:'Dus'}},",
"{id:'item-2',productId:'p1',productName:'Amplop 110 PPL',quantity:1,unitPrice:0,subtotal:0,product:{unit:'Dus'}}",
"],customerName:'Pelanggan Umum',createdAt:'2026-10-19T03:00:00Z'};",
"window.prints=[];window.print=()=>window.prints.push(document.querySelector('#draft-receipt-page').innerText);",
"function Harness(){const [open,setOpen]=useState(false);const [role,setRole]=useState('OWNER');const [replaced,setReplaced]=useState(false);window.replaceVisibleItems=()=>setReplaced(true);window.restoreVisibleItems=()=>setReplaced(false);return <QueryClientProvider client={client}><RoleProvider role={role} userId='fixture-owner' userName='Owner'>",
"<button onClick={()=>setOpen(true)}>Buka cetak</button><button onClick={()=>setRole('SALES')}>Pakai Sales</button><button onClick={()=>setRole('OWNER')}>Pakai Owner</button>",
"<DraftReceiptModal open={open} onClose={()=>setOpen(false)} transaction={replaced?{...transaction,items:transaction.items.map(item=>({...item,id:item.id+'-new'}))}:transaction}/>",
"</RoleProvider></QueryClientProvider>;}createRoot(document.getElementById('root')).render(<Harness/>);"
].join("\n");
const bundle=await build({stdin:{contents:entry,resolveDir:web,loader:"tsx"},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",loader:{".css":"empty"},alias:{"@":web,"@pos/ui":path.join(repo,"packages/ui/src/index.ts")},define:{"process.env.NODE_ENV":'"production"'}});
const configBundle=await build({entryPoints:[path.join(web,"tailwind.config.ts")],bundle:true,write:false,platform:"node",format:"cjs",packages:"external",alias:{"@pos/config/tailwind.config":path.join(repo,"packages/config/tailwind.config.ts")}});
const configModule={exports:{}};
new Function("require","module","exports",configBundle.outputFiles[0].text)(require,configModule,configModule.exports);
const sources=await Promise.all(["components/DraftReceiptModal.tsx","features/transactions-draft/components/DraftNumberField.tsx","features/transaction-tax/components/TaxField.tsx"].map(file=>readFile(path.join(web,file),"utf8")));
sources.push(...await Promise.all(["Modal.tsx","Button.tsx"].map(file=>readFile(path.join(repo,"packages/ui/src",file),"utf8"))));
const styles=await require("postcss")([require("tailwindcss")({...configModule.exports.default,content:[...sources,entry].map(raw=>({raw,extension:"tsx"}))})]).process("@tailwind base;@tailwind components;@tailwind utilities;",{from:undefined});
const printCss=await readFile(path.join(web,"components/draft-receipt-print.css"),"utf8");
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:2});page.setDefaultTimeout(6000);
 const errors=[];page.on("pageerror",error=>errors.push(error.message));
 let saved=[{id:"item-1",productName:"Amplop 110 PPL",documentName:null},{id:"item-2",productName:"Amplop 110 PPL",documentName:"Amplop untuk arsip"}];
 let failLoad=false,failSave=false,delaySave;const writes=[];
 await page.route("http://localhost:3004/**",async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==="/fixture")return route.fulfill({contentType:"text/html",body:'<html lang="id"><body><div id="root"></div></body></html>'});
  if(url.pathname==="/api/settings/store")return route.fulfill({json:{name:"Toko Teladan"}});
  if(url.pathname.endsWith("/tax"))return route.fulfill({json:{transaction:{id:"draft-1",status:"DRAFT",subtotal:22500,discount:0,tax:0,total:22500,taxRate:null,taxMethod:"DPP_NILAI_LAIN",amountPaid:0,change:0,paymentMethod:"CASH"},snapshot:{}}});
  if(url.pathname.endsWith("/draft-number"))return route.fulfill({json:{draftNumber:"PNW-TLD-20261019-001",automaticNumber:"PNW-TLD-20261019-001"}});
  if(url.pathname.endsWith("/document-item-names")){
   if(route.request().method()==="PATCH"){
    const body=route.request().postDataJSON();writes.push(body);if(delaySave)await delaySave;
    if(failSave)return route.fulfill({status:409,json:{message:"Nama dokumen gagal disimpan. Coba lagi."}});
    saved=saved.map(item=>({...item,documentName:body.items.find(change=>change.id===item.id).documentName}));
    return route.fulfill({json:{items:saved}});
   }
   if(failLoad)return route.fulfill({status:503,json:{message:"Nama barang belum dapat dimuat."}});
   return route.fulfill({json:{items:saved}});
  }
  return route.fulfill({status:404,body:"Unknown fixture"});
 });
 await page.goto("http://localhost:3004/fixture");await page.addStyleTag({content:styles.css+printCss});await page.addScriptTag({content:bundle.outputFiles[0].text});
 const open=()=>page.getByRole("button",{name:"Buka cetak",exact:true}).click();
 const close=()=>page.getByRole("button",{name:"Tutup",exact:true}).click();
 const print=()=>page.getByRole("button",{name:"Cetak Nota Penawaran",exact:true}).click();
 const names=()=>page.getByRole("textbox",{name:/Nama pada nota item/});
 const waitReady=()=>page.waitForFunction(()=>{const input=document.querySelector('[aria-label="Nama pada nota item 1"]');return input&&!input.disabled;});
 await open();
 assert.equal(await names().count(),2,"each existing line must have an accessible name editor");
 await waitReady();
 assert.equal(await names().nth(0).inputValue(),"Amplop 110 PPL");
 assert.equal(await page.getByRole("button",{name:"Kembalikan nama POS item 1",exact:true}).count(),0,"unchanged names should not add reset controls to the receipt");
 assert.ok((await page.locator("#draft-receipt-page .draft-item-screen-only").first().boundingBox()).height<=60,"name editor must blend into a compact receipt row");
 assert.equal(await names().nth(1).inputValue(),"Amplop untuk arsip","duplicate products must have independent saved names");
 assert.equal(await page.getByText("Nama POS: Amplop 110 PPL",{exact:true}).count(),2);
 await names().nth(0).fill("  Amplop Putih No. 110  ");
 let releaseSave;delaySave=new Promise(resolve=>{releaseSave=resolve;});
 await print();assert.equal(await page.evaluate(()=>window.prints.length),0,"must persist names before printing");
 releaseSave();delaySave=undefined;await page.waitForFunction(()=>window.prints.length===1);
 assert.equal(saved[0].documentName,"Amplop Putih No. 110");
 assert.equal(writes[0].items[0].expectedDocumentName,null);
 assert.equal(writes[0].items[1].documentName,"Amplop untuk arsip");
 await page.emulateMedia({media:"print"});const paper=await page.locator("#draft-receipt-page").innerText();
 assert.ok(paper.includes("Amplop Putih No. 110"));assert.ok(paper.includes("Amplop untuk arsip"));
 for(const hidden of ["Amplop 110 PPL","Nama POS","Kembalikan nama POS","Nama pada nota"])assert.equal(paper.includes(hidden),false,hidden+" must not appear on paper");
 await page.emulateMedia({media:"screen"});
 assert.equal(await page.getByText("Nama POS: Amplop 110 PPL",{exact:true}).first().isVisible(),true);
 const output=path.join(repo,"output/playwright/document-item-names");await mkdir(output,{recursive:true});
 await page.locator("#draft-receipt-page .draft-item-screen-only").first().screenshot({path:path.join(output,"nama-item-dokumen.png")});
 const publicOutput=path.join(web,"public/images/changelog");await mkdir(publicOutput,{recursive:true});
 await page.locator("#draft-receipt-page .draft-item-screen-only").first().screenshot({path:path.join(publicOutput,"nama-item-dokumen.png")});
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,"A4 preview must scroll within the dialog on mobile");
 await page.setViewportSize({width:1280,height:1000});
 await close();await open();await waitReady();
 assert.equal(await names().nth(0).inputValue(),"Amplop Putih No. 110","reopen must fetch saved name with stale parent props");
 await names().nth(0).fill(" ");
 assert.equal(await page.getByRole("button",{name:"Cetak Nota Penawaran",exact:true}).isDisabled(),true,"blank name must block printing");
 await names().nth(0).fill("Nama gagal");failSave=true;await print();
 await page.getByRole("alert").filter({hasText:"Nama dokumen gagal disimpan"}).waitFor();
 assert.equal(await page.evaluate(()=>window.prints.length),1,"failed save must not print");failSave=false;
 await names().nth(0).fill("Nama sementara");await names().nth(0).press("Escape");
 assert.equal(await names().nth(0).inputValue(),"Amplop Putih No. 110","Escape restores the saved name");
 await page.getByRole("button",{name:"Kembalikan nama POS item 1",exact:true}).click();
 assert.equal(await names().nth(0).inputValue(),"Amplop 110 PPL");
 await print();await page.waitForFunction(()=>window.prints.length===2);assert.equal(saved[0].documentName,null);
 await names().nth(0).fill("Amplop Putih untuk pelanggan");
 let releaseCanceledSave;delaySave=new Promise(resolve=>{releaseCanceledSave=resolve;});
 await print();await page.keyboard.press("Escape");await open();await waitReady();
 await names().nth(0).fill("Nama baru setelah buka");
 const canceledResponse=page.waitForResponse(response=>response.url().endsWith("/document-item-names")&&response.request().method()==="PATCH");
 releaseCanceledSave();delaySave=undefined;await canceledResponse;
 await page.waitForFunction(()=>!document.querySelector('[aria-label="Nama pada nota item 1"]').disabled);
 assert.equal(await page.evaluate(()=>window.prints.length),2,"an old pending save must not print a reopened receipt");
 assert.equal(await names().nth(0).inputValue(),"Nama baru setelah buka","late save response must not overwrite new session edits");
 await names().nth(0).fill("Nama untuk sesi yang berubah");
 let releaseReplacedSave;delaySave=new Promise(resolve=>{releaseReplacedSave=resolve;});
 await print();await page.evaluate(()=>window.replaceVisibleItems());
 const replacedResponse=page.waitForResponse(response=>response.url().endsWith("/document-item-names")&&response.request().method()==="PATCH");
 releaseReplacedSave();delaySave=undefined;await (await replacedResponse).finished();
 await page.evaluate(()=>new Promise(requestAnimationFrame));
 assert.equal(await page.evaluate(()=>window.prints.length),2,"replacing item IDs during a save must cancel the pending print");
 await page.evaluate(()=>window.restoreVisibleItems());
 await close();await page.getByRole("button",{name:"Pakai Sales",exact:true}).click();await open();
 await page.waitForFunction(()=>document.querySelector('[aria-label="Nama pada nota item 2"]')?.value==="Amplop untuk arsip");
 assert.equal(await names().nth(0).evaluate(element=>element.readOnly),true,"read-only users must retain names without edit access");
 const readOnlyName=await names().nth(1).inputValue();
 await names().nth(1).focus();await page.keyboard.press("ControlOrMeta+A");await page.keyboard.press("Backspace");await page.keyboard.type("Nama tanpa izin");
 assert.equal(await names().nth(1).inputValue(),readOnlyName,"keyboard editing must not change a saved name without permission");
 assert.equal(await page.getByRole("button",{name:/Kembalikan nama POS item/}).count(),0,"read-only users must not receive reset actions");
 const previousWrites=writes.length;await print();await page.waitForFunction(()=>window.prints.length===3);assert.equal(writes.length,previousWrites);
 await close();failLoad=true;await open();await page.getByRole("alert").filter({hasText:"Nama barang belum dapat dimuat"}).waitFor();
 assert.equal(await page.getByRole("button",{name:"Cetak Nota Penawaran",exact:true}).isDisabled(),true,"failed read must block printing stale names");
 await close();failLoad=false;saved=saved.map(item=>({...item,id:item.id+"-replaced"}));await open();
 await page.getByRole("alert").filter({hasText:"Daftar item sudah berubah"}).waitFor();
 assert.equal(await page.getByRole("button",{name:"Cetak Nota Penawaran",exact:true}).isDisabled(),true,"stale parent rows must not print fallback POS names for replaced items");
 await close();saved=saved.map(item=>({...item,id:item.id.replace("-replaced","")}));await open();await waitReady();
 await page.evaluate(()=>window.replaceVisibleItems());
 await page.waitForFunction(()=>document.querySelector('[aria-label="Nama pada nota item 1"]')?.disabled);
 assert.equal(await page.getByRole("button",{name:"Cetak Nota Penawaran",exact:true}).isDisabled(),true,"parent item replacement must immediately invalidate printable saved names");
 await page.evaluate(()=>window.restoreVisibleItems());await close();
 await page.getByRole("button",{name:"Pakai Owner",exact:true}).click();await open();await waitReady();

 const writesBeforeKeyboard=writes.length;
 const printsBeforeKeyboard=await page.evaluate(()=>window.prints.length);
 const firstSavedName=await names().nth(0).inputValue();
 const secondSavedName=await names().nth(1).inputValue();
 await names().nth(0).fill("Nama dari keyboard");await names().nth(0).press("Enter");
 assert.equal(await names().nth(0).evaluate(element=>element===document.activeElement),false,"Enter must finish editing without inserting a line break");
 assert.equal(await names().nth(0).inputValue(),"Nama dari keyboard");
 assert.equal(writes.length,writesBeforeKeyboard,"finishing an edit must wait for the print action to save");
 assert.equal(await page.evaluate(()=>window.prints.length),printsBeforeKeyboard,"Enter in the name editor must not print the document");
 await names().nth(0).press("Escape");
 assert.equal(await names().nth(0).inputValue(),firstSavedName,"Escape must restore the saved name and leave the dialog open");
 await names().nth(0).fill("Nama untuk reset dengan keyboard");await names().nth(0).press("Tab");
 assert.equal(await page.getByRole("button",{name:"Kembalikan nama POS item 1",exact:true}).evaluate(element=>element===document.activeElement),true,"Tab must make the per-line reset reachable");
 await page.keyboard.press("Enter");
 assert.equal(await names().nth(0).inputValue(),"Amplop 110 PPL","keyboard reset must restore only its own line");
 assert.equal(await names().nth(1).inputValue(),secondSavedName,"resetting one duplicate product must retain the other line's alias");
 await names().nth(1).focus();await page.keyboard.press("Shift+Tab");
 assert.equal(await names().nth(0).evaluate(element=>element===document.activeElement),true,"Shift+Tab must return to the previous name after its reset control disappears");
 await names().nth(0).fill("\u00a0\u2003");
 assert.equal(await page.getByRole("button",{name:"Cetak Nota Penawaran",exact:true}).isDisabled(),true,"Unicode whitespace must not produce a blank printable name");
 await names().nth(0).press("Escape");

 const boundaryName="A".repeat(300);
 await names().nth(0).fill(boundaryName);await names().nth(0).press("End");await names().nth(0).press("b");
 assert.equal(await names().nth(0).inputValue(),boundaryName,"typing the 301st character must preserve the valid 300-character name");
 assert.equal(await page.getByRole("button",{name:"Cetak Nota Penawaran",exact:true}).isEnabled(),true,"a name exactly at the limit must remain printable");
 await print();await page.waitForFunction(count=>window.prints.length===count,printsBeforeKeyboard+1);
 assert.equal(saved.find(item=>item.id==="item-1").documentName,boundaryName,"a 300-character name must persist without truncation");
 await page.emulateMedia({media:"print"});
 assert.ok((await page.locator("#draft-receipt-page").innerText()).includes(boundaryName),"the full boundary name must reach printed output");
 await page.emulateMedia({media:"screen"});

 const literalAlias='Paket café – 東京 & <img src=x onerror="window.aliasExecuted=true"> "Arsip"';
 const secondAlias="Arsip   pelanggan / #2 (Rp 10.000)";
 await names().nth(0).fill("\u00a0  "+literalAlias+"  \u2003");await names().nth(1).fill(secondAlias);
 await print();await page.waitForFunction(count=>window.prints.length===count,printsBeforeKeyboard+2);
 assert.equal(saved.find(item=>item.id==="item-1").documentName,literalAlias,"save must trim outer Unicode whitespace without changing the alias");
 assert.equal(saved.find(item=>item.id==="item-2").documentName,secondAlias,"internal spaces and punctuation must be preserved independently for duplicate products");
 await page.emulateMedia({media:"print"});
 const literalPaper=await page.locator("#draft-receipt-page").innerText();
 assert.ok(literalPaper.includes(literalAlias),"Unicode and HTML-looking names must print as literal text");
 assert.equal(literalPaper.includes("Amplop 110 PPL"),false,"POS reference names must stay off the printed document");
 assert.equal(await page.locator("#draft-receipt-page .draft-item-print-name img").count(),0,"document aliases must not create HTML elements");
 assert.equal(await page.evaluate(()=>window.aliasExecuted),undefined,"document aliases must not execute markup");
 await page.emulateMedia({media:"screen"});
 await close();saved.reverse();await open();await waitReady();
 assert.equal(await names().nth(0).inputValue(),literalAlias,"reordered API results must map aliases by line ID, not array position");
 assert.equal(await names().nth(1).inputValue(),secondAlias);
 await names().nth(0).fill(" \u00a0Amplop 110 PPL\u2003 ");
 await print();await page.waitForFunction(count=>window.prints.length===count,printsBeforeKeyboard+3);
 assert.equal(saved.find(item=>item.id==="item-1").documentName,null,"typing the exact POS name with outer whitespace must clear the override");
 assert.equal(saved.find(item=>item.id==="item-2").documentName,secondAlias,"clearing an override must preserve the other line after a reordered load");
 assert.deepEqual(errors,[]);
 console.log("PASS: two names, duplicate lines, save before print, print-only alias, reload, blank, failure, reset, Escape, role access, keyboard, 300/301 boundary, Unicode, literal HTML, reordered rows");
}finally{await browser.close();}
