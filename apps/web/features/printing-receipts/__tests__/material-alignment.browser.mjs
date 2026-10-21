import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repo = process.cwd();
const web = path.join(repo, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const esbuild = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const bundle = await esbuild.build({
  stdin: { contents: `
    import React,{useState} from 'react';
    import {createRoot} from 'react-dom/client';
    import {PrintingReceiptView} from './features/printing-receipts/components/PrintingReceiptView';
    const initial = {id:'alignment',storeId:'store',number:'CONTOH',revision:1,subcategory:'SPANDUK',transactionId:null,
      createdAt:'2026-10-21',updatedAt:'2026-10-21',document:{customerName:'',customerPhone:'',customerId:null,date:'2026-10-21',note:'',
      completionDate:'',completionTime:'',receiver:'',setter:'',signatory:'',lines:[{id:'1',name:'Cetak contoh',material:'test',quantity:2,price:15000,stockLink:null}]}};
    function Harness(){const [receipt,setReceipt]=useState(initial);const [editable,setEditable]=useState(true);
      window.setEditable=setEditable;return <PrintingReceiptView receipt={receipt} editable={editable} onChange={setReceipt}/>;}
    createRoot(document.getElementById('root')).render(<Harness/>);
  `, resolveDir: web, loader: "tsx" },
  bundle: true, write: false, outfile: "alignment.js", platform: "browser", format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>${bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text ?? ''}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(file => file.path.endsWith('.js')).text}</script></body></html>`;
const browser = await chromium.launch({headless:true});
try {
  for (const width of [1280,390]) {
    const page = await browser.newPage({viewport:{width,height:900}});
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/images/printing-receipts/')) return route.fulfill({contentType:'image/png',body:await readFile(path.join(web,'public',url.pathname))});
      return route.fulfill({contentType:'text/html',body:html});
    });
    await page.goto('http://localhost:4379/');
    const material = page.getByLabel('Bahan baris 1',{exact:true});
    await material.waitFor();
    for (const editable of [true,false]) {
      await page.evaluate(value=>window.setEditable(value),editable);
      await page.waitForFunction(value=>!!document.querySelector('textarea[aria-label="Bahan baris 1"]')===value,editable);
      const styles = await page.evaluate(()=>{
        const read = label=>{const element=document.querySelector(`[aria-label="${label} baris 1"]`);const css=getComputedStyle(element);
          const box=element.getBoundingClientRect();const line=parseFloat(css.lineHeight);
          const y=element.tagName==='INPUT'?box.y+(box.height-line)/2:box.y+parseFloat(css.paddingTop);
          return {font:css.fontSize,align:css.textAlign,y};};
        return {material:read('Bahan'),quantity:read('Banyaknya')};
      });
      assert.equal(styles.material.font,styles.quantity.font,'Bahan and Banyak must use the same font size');
      assert.equal(styles.material.align,styles.quantity.align,'Bahan and Banyak must share horizontal alignment');
      assert.ok(Math.abs(styles.material.y-styles.quantity.y)<0.6,`Text vertical positions must match: ${JSON.stringify(styles)}`);
    }
    await page.evaluate(()=>window.setEditable(true));
    await page.waitForFunction(()=>!!document.querySelector('textarea[aria-label="Bahan baris 1"]'));
    await material.fill('Flexi 280');
    assert.equal(await material.inputValue(),'Flexi 280');
    assert.ok(await material.evaluate(element=>element.clientHeight>=element.scrollHeight-1),'Wrapped material remains fully visible');
    process.stdout.write(`PASS ${width}px: matching font, horizontal and vertical alignment, editable/read-only, wrapping\n`);
    await page.close();
  }
} finally {await browser.close();}
