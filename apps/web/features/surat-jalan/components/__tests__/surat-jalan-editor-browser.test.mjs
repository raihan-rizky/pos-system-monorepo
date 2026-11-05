import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { bundleReactHarness, repo, web } from "../../../product-stock-groups/__tests__/browser-harness.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const bundle = await bundleReactHarness(`
  import React,{useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {SuratJalanReceiptEditor} from './features/surat-jalan/components/SuratJalanReceiptEditor';
  import {createSuratJalan,updateSuratJalanDocument} from './features/surat-jalan/api/surat-jalan-api';
  const transaction={id:'txn-1',invoiceNumber:'INV-CONTOH',customerName:'Pelanggan Contoh',status:'COMPLETED',stockDeductionSource:'TRANSACTION',items:[{id:'line-1',productId:'paper',printingServiceId:null,productName:'Kertas HVS A4',quantity:10,unit:'rim'},{id:'line-2',productId:'pen',printingServiceId:null,productName:'Pulpen',quantity:5,unit:'pak'}]};
  const initial={transaction,suratJalan:[],remainingItems:[],eligibility:{eligible:true},progress:{totalQuantity:15,deliveredQuantity:0,pendingQuantity:0,remainingQuantity:15}};
  function Harness(){const [data,setData]=useState(initial);const [open,setOpen]=useState(true);const [canUpdate,setCanUpdate]=useState(true);window.setCanUpdate=setCanUpdate;window.setBundle=setData;window.setEditorOpen=setOpen;
    async function save(record,changes){const saved=record?await updateSuratJalanDocument(record.id,{...changes,expectedUpdatedAt:record.updatedAt}):await createSuratJalan({transactionId:'txn-1',...changes});setData(current=>({...current,suratJalan:[saved]}));return saved;}
    return <><button onClick={()=>setOpen(true)}>Buka surat jalan</button>{open&&<SuratJalanReceiptEditor bundle={data} canCreate={true} canUpdate={canUpdate} store={{name:'TOKO TELADAN',address:'Jl. Temu Putih No.30 Cilegon',phone:'0254 393022'}} onSave={save} onClose={()=>setOpen(false)}/>}</>;
  }
  window.prints=[];window.print=()=>window.prints.push(document.getElementById('surat-jalan-print').innerText);
  createRoot(document.getElementById('root')).render(<Harness/>);
`, ["features/surat-jalan/components/SuratJalanReceiptEditor.tsx", "features/surat-jalan/components/SuratJalanDocument.tsx", "../../packages/ui/src/Modal.tsx"]);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  page.setDefaultTimeout(7000);
  const errors = [];
  const requests = [];
  let failSave = false;
  let saved;
  let releaseSave;
  let holdSave = false;
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://localhost:3004/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' });
    if (url.pathname === "/images/logo_teladan.png") return route.fulfill({ contentType: "image/png", body: await readFile(path.join(web,"public/images/logo_teladan.png")) });
    if (route.request().method() === "POST" || route.request().method() === "PATCH") {
      const body = route.request().postDataJSON(); requests.push({ method: route.request().method(), body });
      await new Promise(resolve => setTimeout(resolve, 70));
      if (holdSave) await new Promise(resolve => { releaseSave = resolve; });
      if (failSave) return route.fulfill({ status:409,json:{message:"Surat jalan sudah diubah pengguna lain. Muat data terbaru."} });
      saved={id:'sj-1',transactionId:'txn-1',updatedAt:'2026-11-05T04:00:00.000Z',number:'SJ-CONTOH-001',status:'CONFIRMED',recipientName:body.recipientName,createdAt:'2026-11-05T03:00:00.000Z',confirmedAt:'2026-11-05T04:00:00.000Z',sequence:1,items:Object.entries(body.quantities).filter(([,qty])=>qty>0).map(([id,qty])=>({id:'sj-'+id,transactionItemId:id,productId:id==='line-1'?'paper':'pen',productName:body.documentNames[id].trim(),quantity:qty,unit:id==='line-1'?'rim':'pak',keterangan:body.keterangan[id].trim()}))};
      return route.fulfill({json:saved});
    }
    return route.fulfill({status:404});
  });
  await page.goto("http://localhost:3004/fixture");
  await page.addStyleTag({content:bundle.css});
  await page.addScriptTag({content:bundle.script});
  const recipient=page.getByLabel("Penerima",{exact:true});
  await recipient.waitFor();
  assert.equal(await recipient.inputValue(),"Pelanggan Contoh");
  assert.equal(await page.getByRole("button",{name:"Buat Surat Jalan",exact:true}).count(),0);
  assert.equal(await page.getByText("TOTAL INVOICE",{exact:true}).count(),0);
  assert.equal(requests.length,0);
  await recipient.fill("Gudang Contoh");
  await page.getByLabel("Nama barang 1",{exact:true}).fill("Kertas untuk rapat");
  await page.getByLabel("Jumlah barang 1",{exact:true}).fill("7");
  await page.getByLabel("Keterangan barang 1",{exact:true}).fill("Lantai 2");
  await page.getByLabel("Jumlah barang 2",{exact:true}).fill("0");
  await page.getByRole("button",{name:"Simpan & Cetak",exact:true}).evaluate(button=>{button.click();button.click();});
  await page.waitForFunction(()=>window.prints.length===1);
  assert.equal(requests.length,1);
  assert.equal(requests[0].method,"POST");
  assert.deepEqual(requests[0].body.quantities,{"line-1":7,"line-2":0});
  assert.equal(requests[0].body.documentNames["line-1"],"Kertas untuk rapat");
  assert.equal(requests[0].body.recipientName,"Gudang Contoh");
  assert.match((await page.evaluate(()=>window.prints))[0],/SJ-CONTOH-001/);
  await page.getByRole("button",{name:"Cetak",exact:true}).click();
  assert.equal(requests.length,1);
  assert.equal(await page.evaluate(()=>window.prints.length),2);

  failSave=true;
  await page.getByLabel("Jumlah barang 1",{exact:true}).fill("6");
  await page.getByRole("button",{name:"Simpan & Cetak",exact:true}).click();
  await page.getByRole("alert").filter({hasText:"sudah diubah"}).waitFor();
  assert.equal(await page.getByLabel("Jumlah barang 1",{exact:true}).inputValue(),"6");
  assert.equal(await page.evaluate(()=>window.prints.length),2);
  await page.getByRole("button",{name:"Tutup",exact:true}).click();
  await page.getByRole("button",{name:"Lanjut edit",exact:true}).click();
  assert.equal(await page.getByLabel("Jumlah barang 1",{exact:true}).inputValue(),"6");
  await page.getByLabel("Jumlah barang 1",{exact:true}).focus();
  await page.getByLabel("Jumlah barang 1",{exact:true}).fill("5");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByLabel("Jumlah barang 1",{exact:true}).inputValue(),"6");
  assert.equal(await page.getByRole("dialog").count(),1);
  await page.getByRole("button",{name:"Tutup",exact:true}).click();
  await page.getByRole("button",{name:"Buang perubahan",exact:true}).click();
  await page.getByRole("button",{name:"Buka surat jalan",exact:true}).click();
  assert.equal(await page.getByLabel("Jumlah barang 1",{exact:true}).inputValue(),"7");
  await page.evaluate(()=>window.setCanUpdate(false));
  await page.waitForFunction(()=>document.querySelector('[aria-label="Jumlah barang 1"]').readOnly);
  await page.getByRole("button",{name:"Cetak",exact:true}).click();
  assert.equal(requests.length,2);

  await page.setViewportSize({width:390,height:844});
  const fits=await page.evaluate(()=>({page:document.documentElement.scrollWidth<=innerWidth,dialog:[...document.querySelectorAll('[role="dialog"]')].every(el=>el.scrollWidth<=el.clientWidth)}));
  assert.deepEqual(fits,{page:true,dialog:true});
  await page.emulateMedia({media:"print"});
  const printState=await page.evaluate(()=>({editableVisible:[...document.querySelectorAll('#surat-jalan-print input,#surat-jalan-print textarea')].some(el=>getComputedStyle(el).display!=="none"),content:document.getElementById('surat-jalan-print').innerText,overflow:getComputedStyle(document.getElementById('surat-jalan-print')).overflow,appHidden:getComputedStyle(document.getElementById('root')).display==="none"}));
  assert.equal(printState.editableVisible,false);
  assert.match(printState.content,/Kertas untuk rapat/);
  assert.match(printState.content,/Lantai 2/);
  assert.equal(printState.overflow,"visible");
  assert.equal(printState.appHidden,true,"application layout must not occupy blank printed pages");
  await page.emulateMedia({media:"screen"});
  await page.setViewportSize({width:1280,height:1000});
  await page.evaluate(()=>window.setCanUpdate(true));
  const output=path.join(repo,"output/surat-jalan-inline-20261105");
  await mkdir(output,{recursive:true});
  await page.screenshot({path:path.join(output,"editor-desktop.png"),fullPage:true});
  const releaseImages=path.join(web,"public/images/changelog");
  await mkdir(releaseImages,{recursive:true});
  await page.getByRole("dialog").screenshot({path:path.join(releaseImages,"surat-jalan-edit-langsung.png")});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(output,"editor-mobile.png"),fullPage:true});
  await page.setViewportSize({width:1280,height:1000});
  await page.getByRole("button",{name:"Pengiriman baru",exact:true}).click();
  assert.equal(await page.getByLabel("Jumlah barang 1",{exact:true}).inputValue(),"3");
  assert.equal(await page.getByLabel("Jumlah barang 2",{exact:true}).inputValue(),"5");
  await page.getByLabel("Jumlah barang 1",{exact:true}).fill("");
  const beforeInvalid=requests.length;
  await page.getByRole("button",{name:"Simpan & Cetak",exact:true}).click();
  await page.getByRole("alert").filter({hasText:"Periksa jumlah"}).waitFor();
  assert.equal(requests.length,beforeInvalid);
  await page.getByLabel("Jumlah barang 1",{exact:true}).fill("2");
  await page.getByLabel("Pilih surat jalan",{exact:true}).selectOption("sj-1");
  await page.getByRole("button",{name:"Lanjut edit",exact:true}).click();
  assert.equal(await page.getByLabel("Jumlah barang 1",{exact:true}).inputValue(),"2");
  await page.getByLabel("Pilih surat jalan",{exact:true}).selectOption("sj-1");
  await page.getByRole("button",{name:"Buang perubahan",exact:true}).click();
  assert.equal(await page.getByLabel("Jumlah barang 1",{exact:true}).inputValue(),"7");

  // A background refresh cannot erase edits or replace the version being edited.
  await page.getByLabel("Keterangan barang 1",{exact:true}).fill("Catatan lokal");
  await page.evaluate(()=>window.setBundle(current=>({...current,suratJalan:current.suratJalan.map(record=>({...record,recipientName:"Pembaruan dari server",updatedAt:"2026-11-05T05:00:00.000Z"}))})));
  assert.equal(await page.getByLabel("Keterangan barang 1",{exact:true}).inputValue(),"Catatan lokal");
  assert.equal(await page.getByLabel("Penerima",{exact:true}).inputValue(),"Gudang Contoh");

  // Saves disable close/switch; an externally unmounted editor never prints late.
  failSave=false;holdSave=true;
  const printsBeforeLate=await page.evaluate(()=>window.prints.length);
  await page.getByRole("button",{name:"Simpan & Cetak",exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[aria-label="Pilih surat jalan"]').disabled);
  await page.getByRole("button",{name:"Tutup modal",exact:true}).click();
  assert.equal(await page.getByRole("dialog").count(),1);
  await page.evaluate(()=>window.setEditorOpen(false));
  while(!releaseSave) await new Promise(resolve=>setTimeout(resolve,20));
  releaseSave();
  await page.waitForResponse(response=>response.request().method()==="PATCH"&&response.status()===200);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(await page.evaluate(()=>window.prints.length),printsBeforeLate);

  // Latest active selection, pending reservations, closed rows, and long print output.
  const longItems=Array.from({length:42},(_,index)=>({...saved.items[0],id:`sj-long-${index}`,transactionItemId:`long-${index}`,productName:`Barang contoh panjang ${index+1} dengan nama yang membungkus ke baris berikutnya`,quantity:1,keterangan:`Keterangan contoh ${index+1} untuk memeriksa hasil cetak.`}));
  await page.evaluate(({saved,longItems})=>window.setBundle(current=>({...current,
    transaction:{...current.transaction,items:longItems.map(item=>({...item,id:item.transactionItemId,printingServiceId:null,quantity:10}))},
    suratJalan:[{...saved,id:"closed",sequence:99,status:"CANCELLED"},{...saved,id:"pending",number:"SJ-PENDING",sequence:2,status:"PENDING",items:longItems},{...saved,id:"older",sequence:1,items:longItems.map(item=>({...item,quantity:2}))}]
  })),{saved,longItems});
  await page.getByRole("button",{name:"Buka surat jalan",exact:true}).click();
  assert.equal(await page.getByLabel("Pilih surat jalan",{exact:true}).inputValue(),"pending");
  await page.getByLabel("Pilih surat jalan",{exact:true}).selectOption("closed");
  assert.equal(await page.getByLabel("Jumlah barang 1",{exact:true}).getAttribute("readonly"),"");
  await page.getByLabel("Pilih surat jalan",{exact:true}).selectOption("pending");
  await page.emulateMedia({media:"print"});
  await page.pdf({path:path.join(output,"long-document.pdf"),preferCSSPageSize:true,printBackground:true});
  assert.match(await page.locator("#surat-jalan-print").innerText(),/Barang contoh panjang 42/);
  await page.emulateMedia({media:"screen"});
  await page.getByRole("button",{name:"Tutup",exact:true}).click();
  await page.evaluate(saved=>window.setBundle(current=>({...current,transaction:{...current.transaction,items:[{...saved.items[0],id:saved.items[0].transactionItemId,quantity:10,printingServiceId:null}]},suratJalan:[saved]})),saved);
  await page.getByRole("button",{name:"Buka surat jalan",exact:true}).click();
  holdSave=false;
  await page.getByLabel("Nama barang 1",{exact:true}).fill("Nama dari editor");
  const beforeRefreshSave=await page.evaluate(()=>window.prints.length);
  await page.getByRole("button",{name:"Simpan & Cetak",exact:true}).click();
  await page.waitForFunction(count=>window.prints.length===count+1,beforeRefreshSave);
  await page.evaluate(()=>window.setBundle(current=>({...current,suratJalan:current.suratJalan.map(record=>({...record,updatedAt:"2026-11-05T06:00:00.000Z",items:record.items.map(item=>({...item,productName:"Nama dari pengguna lain",quantity:5}))}))})));
  await page.waitForFunction(()=>document.querySelector('[aria-label="Jumlah barang 1"]').value==="5");
  assert.equal(await page.getByLabel("Nama barang 1",{exact:true}).inputValue(),"Nama dari pengguna lain");
  const beforeRefreshedPrint=requests.length;
  await page.getByRole("button",{name:"Cetak",exact:true}).click();
  assert.equal(requests.length,beforeRefreshedPrint);
  await page.emulateMedia({media:"print"});
  assert.match(await page.locator("#surat-jalan-print").innerText(),/Nama dari pengguna lain/);
  assert.deepEqual(errors,[]);
  process.stdout.write("PASS: direct receipt, inline payload, one save, canonical print, reprint, conflict retention, dirty close/switch, Escape, read-only access, refresh retention, unmount safety, mobile and long-document print\n");
} finally { await browser.close(); }
