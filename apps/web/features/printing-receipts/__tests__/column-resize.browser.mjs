import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repo = process.cwd();
const web = path.join(repo, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const esbuild = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium, expect } = require("@playwright/test");
const bundle = await esbuild.build({
  stdin: { contents: `
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {PrintingReceiptView} from './features/printing-receipts/components/PrintingReceiptView';
    import {createPrintingReceiptPdf} from './features/printing-receipts/export-pdf';
    import {parsePrintingReceiptDocument} from './features/printing-receipts/domain';
    import {buildPrintingReceiptPresentation} from './features/printing-receipts/presentation';
    function Harness(){
      const [receipt,setReceipt]=useState(null),[editable,setEditable]=useState(true),[zoom,setZoom]=useState(1),[allow,setAllow]=useState(false);
      window.setReceipt=setReceipt;window.setEditable=setEditable;window.setZoom=setZoom;window.setAllow=setAllow;window.currentReceipt=receipt;
      window.presentation=receipt&&buildPrintingReceiptPresentation(receipt);
      window.reloadReceipt=()=>setReceipt({...receipt,document:parsePrintingReceiptDocument(JSON.parse(JSON.stringify(receipt.document)))});
      window.exportPdf=async()=>{const pdf=await createPrintingReceiptPdf(receipt);return {bytes:Array.from(new Uint8Array(pdf.output('arraybuffer'))),pages:pdf.getNumberOfPages(),text:pdf.output()};};
      return <main className="printing-receipt-viewport">{receipt&&<PrintingReceiptView receipt={receipt} editable={editable} allowProcessedEdit={allow} zoom={zoom} onChange={value=>{window.changeCount=(window.changeCount||0)+1;setReceipt(value)}}/>}</main>;
    }
    createRoot(document.getElementById('root')).render(<Harness/>);
  `, resolveDir: web, loader: "tsx" }, bundle: true, write: false, outfile: "column-resize.js", platform: "browser", format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0}main{width:100vw;height:100dvh}${bundle.outputFiles.find(file=>file.path.endsWith('.css'))?.text??''}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(file=>file.path.endsWith('.js')).text}</script></body></html>`;
const record = subcategory => ({ id: `resize-${subcategory}`, storeId: "store", number: "CONTOH", revision: 1, subcategory, transactionId: null, createdAt: "2026-10-21", updatedAt: "2026-10-21",
  document: { customerName: "", customerPhone: "", customerId: null, date: "2026-10-21", note: "", completionDate: "", completionTime: "", receiver: "", setter: "", signatory: "",
    lines: [{ id: "1", name: "Contoh spanduk promosi toko", material: "Flexi luar ruang premium ".repeat(3), quantity: null, price: null, stockLink: null }] } });
const output = path.join(repo, "output/playwright/automatic-receipt-rows");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const close = (a, b, message) => assert.ok(Math.abs(a-b) < .04, `${message}: ${a} != ${b}`);
try {
  for (const viewportWidth of [1280,390]) {
    const page = await browser.newPage({viewport:{width:viewportWidth,height:1000},hasTouch:true});
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/*",async route=>{
      const url=new URL(route.request().url());
      return url.pathname.startsWith("/images/printing-receipts/")
        ? route.fulfill({contentType:"image/png",body:await readFile(path.join(web,"public",url.pathname))})
        : route.fulfill({contentType:"text/html",body:html});
    });
    await page.goto("http://localhost:4379/");
    await page.waitForFunction(()=>Boolean(window.setReceipt));
    for(const category of ["SPANDUK","PRINT"]){
      const initial=record(category);
      await page.evaluate(value=>{window.setZoom(1);window.setEditable(true);window.setReceipt(value)},initial);
      const handles=page.getByRole("separator");
      await expect(handles).toHaveCount((category==="SPANDUK"?5:3)*await page.locator('[data-receipt-page]').count());
      const boundary=handles.nth(1);
      await expect(boundary).toHaveAttribute("aria-orientation","vertical");
      await expect(boundary).toHaveAttribute("tabindex","0");
      assert.equal(await boundary.evaluate(el=>getComputedStyle(el).touchAction),"none");
      const widths=()=>page.evaluate(()=>window.currentReceipt.document.columnWidths);
      const defaults=await page.evaluate(()=>window.presentation.pages[0].table.columnXs.slice(1).map((x,i)=>Number((x-window.presentation.pages[0].table.columnXs[i]).toFixed(2))));
      const reset=page.getByRole("button",{name:"Reset lebar kolom",exact:true});
      const drag=async(delta,zoom=1)=>{
        await boundary.scrollIntoViewIfNeeded();
        const box=await boundary.boundingBox();
        await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
        await page.mouse.down();
        await page.mouse.move(box.x+box.width/2+delta*4*zoom,box.y+box.height/2,{steps:5});
        await page.mouse.up();
      };
      // Adjacent resize widens SPANDUK Bahan and A5 price, with the overall table fixed.
      await drag(-10);
      let resized=await widths();
      close(resized[1],defaults[1]-10,"Mouse delta in millimetres");
      close(resized[2],defaults[2]+10,"Only neighbouring column grows");
      close(resized.reduce((a,b)=>a+b,0),defaults.reduce((a,b)=>a+b,0),"Fixed table width");
      const geometry=await page.evaluate(()=>({
        table:window.presentation.pages[0].table.columnXs,header:window.presentation.pages[0].header.columnXs,
        svg:[...document.querySelector('[data-receipt-header]').querySelectorAll('line')].filter(el=>el.getAttribute('x1')===el.getAttribute('x2')).map(el=>Number(el.getAttribute('x1'))),
      }));
      assert.deepEqual(geometry.header,geometry.table);
      assert.deepEqual(geometry.svg,geometry.table);
      const material=page.locator('textarea[aria-label="Bahan baris 1"]');
      await expect(material).toHaveValue(initial.document.lines[0].material);
      await page.evaluate(()=>window.reloadReceipt());
      assert.deepEqual(await widths(),resized,"JSON save/reload preserves widths");

      await reset.click();
      assert.equal(await widths(),undefined,"Reset removes the optional setting");
      await page.evaluate(()=>window.setZoom(.65));
      await drag(-10,.65);
      resized=await widths();
      close(resized[1],defaults[1]-10,"Zoom must not scale physical delta");

      await reset.click();
      await boundary.focus();
      await boundary.press("ArrowLeft");
      close((await widths())[1],defaults[1]-1,"Keyboard 1mm step");
      await boundary.press("Shift+ArrowLeft");
      close((await widths())[1],defaults[1]-6,"Keyboard Shift 5mm step");
      await boundary.press("Shift+ArrowRight");
      close((await widths())[1],defaults[1]-1,"Keyboard Shift reverse 5mm step");
      await boundary.press("Home");
      close((await widths())[1],30,"Home clamps primary column minimum");
      await boundary.press("End");
      close((await widths())[2],category==="SPANDUK"?6:16,"End clamps adjacent minimum");
      await expect(boundary).toBeFocused();
      await reset.click();

      // Native touch gesture uses Pointer Events and capture, even outside the divider.
      await boundary.scrollIntoViewIfNeeded();
      const touchBox=await boundary.boundingBox();
      const x=touchBox.x+touchBox.width/2,y=touchBox.y+touchBox.height/2;
      const cdp=await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-13,y}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      close((await widths())[1],defaults[1]-5,"Touch physical delta at .65 zoom");
      await cdp.detach();
      await reset.click();

      // Multiple moves in one event task coalesce, while pointerup flushes its last position.
      await boundary.evaluate(el=>{
        const box=el.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
        window.changeCount=0;
        for(const [type,offset] of [['pointerdown',0],['pointermove',-3],['pointermove',-7],['pointerup',-13]])
          el.dispatchEvent(new PointerEvent(type,{pointerId:71,pointerType:'mouse',isPrimary:true,button:0,bubbles:true,clientX:x+offset,clientY:y}));
      });
      close((await widths())[1],defaults[1]-5,"Final pointerup position is saved");
      assert.equal(await page.evaluate(()=>window.changeCount),1,"One synchronous burst emits at most one change");
      await reset.click();

      // In-progress gesture must preserve independent text edits on the same receipt.
      await boundary.scrollIntoViewIfNeeded();
      const liveBox=await boundary.boundingBox();
      await page.mouse.move(liveBox.x+liveBox.width/2,liveBox.y+liveBox.height/2);
      await page.mouse.down();
      await page.evaluate(()=>window.setReceipt({...window.currentReceipt,document:{...window.currentReceipt.document,lines:window.currentReceipt.document.lines.map(line=>({...line,name:'Nama diperbarui saat geser'}))}}));
      await page.mouse.move(liveBox.x+liveBox.width/2-13,liveBox.y+liveBox.height/2);
      await page.mouse.up();
      assert.equal(await page.evaluate(()=>window.currentReceipt.document.lines[0].name),'Nama diperbarui saat geser');
      await reset.click();
      await boundary.scrollIntoViewIfNeeded();
      const switchBox=await boundary.boundingBox();
      await page.mouse.move(switchBox.x+switchBox.width/2,switchBox.y+switchBox.height/2);
      await page.mouse.down();
      const other={...record(category),id:'another-receipt'};
      await page.evaluate(value=>window.setReceipt(value),other);
      await page.waitForFunction(()=>window.currentReceipt.id==='another-receipt');
      await page.mouse.move(switchBox.x+switchBox.width/2-13,switchBox.y+switchBox.height/2);
      await page.mouse.up();
      assert.equal(await page.evaluate(()=>window.currentReceipt.id),'another-receipt');
      assert.equal(await widths(),undefined,"Switching receipts cancels pending resize");

      await page.evaluate(value=>{window.setZoom(1);window.setReceipt(value)},initial);
      await boundary.focus();
      await boundary.press("Shift+ArrowLeft");
      await boundary.press("Shift+ArrowLeft");
      const exported=await page.evaluate(()=>window.exportPdf());
      assert.equal(exported.pages,await page.locator('[data-receipt-page]').count());
      assert.ok(exported.text.includes(category==='SPANDUK'?'Nama File':'Nama Barang'),"Resized headers are real PDF text");
      await writeFile(path.join(output,`${category.toLowerCase()}-resizable-${viewportWidth}.pdf`),Buffer.from(exported.bytes));
      await page.screenshot({path:path.join(output,`${category.toLowerCase()}-resize-${viewportWidth}.png`)});
      if(category==='SPANDUK'&&viewportWidth===1280){
        const header=await page.locator('[data-receipt-header]').first().boundingBox();
        const table=await page.locator('[data-receipt-table]').first().boundingBox();
        await page.screenshot({path:path.join(output,'nota-lebar-kolom.png'),clip:{x:table.x-2,y:header.y-2,width:table.width+4,height:header.height+table.height+4}});
      }
      await page.evaluate(()=>window.setEditable(false));
      await expect(handles).toHaveCount(0);
      await expect(reset).toHaveCount(0);
      await page.evaluate(()=>{window.setEditable(true);window.setReceipt({...window.currentReceipt,transactionId:'processed'})});
      await expect(handles).toHaveCount(0);
      await page.evaluate(()=>window.setAllow(true));
      await expect(handles).toHaveCount((category==='SPANDUK'?5:3)*await page.locator('[data-receipt-page]').count());
      await page.evaluate(()=>window.setAllow(false));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,"Mobile viewport must not overflow");
      process.stdout.write(`PASS ${category} ${viewportWidth}px: mouse, zoom, keyboard, native touch, final flush, save/reload, isolation, shared header/PDF, readonly\n`);
    }
    assert.deepEqual(errors,[]);
    await page.close();
  }
} finally {await browser.close();}
