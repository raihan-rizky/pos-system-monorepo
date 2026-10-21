import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const repo = process.cwd();
const web = path.join(repo, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const esbuild = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const loadConfig = require("tailwindcss/loadConfig");
const feature = path.join(web, "features/printing-receipts/components");
const fixtures = {
  "@/components/providers/RoleProvider": `import React,{useState,createContext,useContext} from 'react';
    const Context=createContext(null);export const useRole=()=>useContext(Context);
    export function HarnessRoleProvider({children}){const [allowed,setAllowed]=useState(false);
    window.grantProcessedEdit=setAllowed;return <Context.Provider value={{role:'ADMIN',userId:'u',storeId:'s',authorizationFingerprint:String(allowed),canPerform:(r,a)=>r==='printing_receipt.processed'?allowed:r==='transaction'}}>{children}</Context.Provider>}`,
  "@/hooks/useProducts": `export const useProductsPage=()=>({data:{data:[{id:'flexi',name:'Flexi contoh',unit:'m²',stock:50,variants:[]}],pagination:{totalPages:1}},isLoading:false});`,
  "@/components/PaymentModal": `export const PaymentModal=()=>null;`,
};
const bundle = await esbuild.build({
  stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{HarnessRoleProvider}from'@/components/providers/RoleProvider';import{PrintingReceiptWorkspace}from'./features/printing-receipts/components/PrintingReceiptWorkspace';const client=new QueryClient({defaultOptions:{queries:{retry:false}}});window.invalidated=[];const invalidate=client.invalidateQueries.bind(client);client.invalidateQueries=(filter,...rest)=>{window.invalidated.push(filter.queryKey[0]);return invalidate(filter,...rest)};createRoot(document.getElementById('root')).render(<QueryClientProvider client={client}><HarnessRoleProvider><PrintingReceiptWorkspace/></HarnessRoleProvider></QueryClientProvider>);`, resolveDir: web, loader: "tsx" },
  bundle: true, write: false, jsx: "automatic", outdir: "bundle", platform: "browser", format: "iife", tsconfig: path.join(web, "tsconfig.json"),
  plugins: [{ name: "fixtures", setup(build) {
    build.onResolve({filter:/^@\//}, args => fixtures[args.path] ? {path:args.path,namespace:"fixture"}:undefined);
    build.onLoad({filter:/.*/,namespace:"fixture"},args=>({contents:fixtures[args.path],loader:"tsx",resolveDir:web}));
  }}],
});
const source = (await Promise.all((await readdir(feature)).filter(file=>file.endsWith(".tsx")).map(file=>readFile(path.join(feature,file),"utf8")))).join("\n");
const config = loadConfig(path.join(web,"tailwind.config.ts"));
const css = await postcss([tailwind({...config,content:[{raw:source,extension:"tsx"},path.join(repo,"packages/ui/src/**/*.{ts,tsx}")]})]).process("@tailwind base;@tailwind components;@tailwind utilities;",{from:undefined});
const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>html,body{margin:0}#root{display:flex;height:100dvh;min-width:0}${css.css}\n${bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text??''}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(f=>f.path.endsWith('.js')).text}</script></body></html>`;
const initial = {id:"processed",storeId:"s",subcategory:"SPANDUK",number:"SP-CONTOH",revision:1,transactionId:"tx",createdAt:"2026-10-21T03:00:00Z",updatedAt:"2026-10-21T03:00:00Z",transaction:{id:"tx",subtotal:75000,discount:0,tax:0,total:75000,amountPaid:25000,change:0,status:"DP"},document:{title:"Contoh koreksi nota",customerName:"Pelanggan Contoh",customerPhone:"",customerId:null,date:"2026-10-21",note:"",completionDate:"",completionTime:"",receiver:"",setter:"",signatory:"",lines:[{id:"line",name:"Spanduk contoh",material:"Flexi",quantity:1,price:75000,stockLink:null}]}};
const output=path.join(repo,"output/playwright/printing-receipts/processed-edit");await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
  for(const width of [1280,390]){
    const page=await browser.newPage({viewport:{width,height:900}});let record=structuredClone(initial);const calls=[];let failSave=false;let failReview=false;const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url()),method=request.method();
      const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:html});
      if(url.pathname.startsWith('/images/printing-receipts/'))return route.fulfill({contentType:'image/png',body:await readFile(path.join(web,'public',url.pathname))});
      const body=request.postDataJSON();calls.push({method,path:url.pathname,body});
      if(url.pathname==='/api/printing-receipts')return json({data:[record],pagination:{page:1,total:1,totalPages:1}});
      if(url.pathname==='/api/printing-receipts/processed')return json({data:record});
      if(url.pathname==='/api/printing-receipts/processed/processed'){
        if(method==='POST'){
          if(failReview)return json({message:'Pembayaran berubah. Tinjau ulang perubahan.'},409);
          const total=body.document.lines.reduce((sum,line)=>sum+(line.quantity??0)*(line.price??0),0);
          return json({data:{reviewToken:'review-token',before:{subtotal:75000,total:75000,paid:25000,debt:50000,status:'DP'},after:{subtotal:total,total,paid:25000,debt:total-25000,status:'DP'},materials:[]}});
        }
        if(method==='PATCH'){
          if(failSave)return json({message:'Stok berubah. Tinjau ulang perubahan.'},409);
          assert.equal(body.acknowledged,true);assert.equal(body.reviewToken,'review-token');
          record={...record,document:body.document,revision:record.revision+1,transaction:{...record.transaction,total:body.document.lines[0].price}};
          return json({data:record});
        }
      }
      return json({data:[]});
    });
    await page.goto('http://processed-nota.test');
    await page.waitForTimeout(1200);
    if(errors.length)throw new Error(errors.join('\n'));
    const choose=async()=>{if(width<768)await page.getByRole('button',{name:'Daftar nota',exact:true}).click();await page.getByRole('button',{name:/Contoh koreksi nota/}).click();};
    await choose();
    assert.equal(await page.getByRole('button',{name:'Edit nota diproses',exact:true}).count(),0,'ordinary transaction edit must not grant processed edits');
    await page.evaluate(()=>window.grantProcessedEdit(true));await choose();
    await page.getByRole('button',{name:'Edit nota diproses',exact:true}).click();
    let dialog=page.getByRole('dialog',{name:'Edit nota diproses'});
    await dialog.waitFor();
    await dialog.getByText(/Anda mengubah nota yang sudah diproses/).waitFor();
    assert.equal(await dialog.locator('#processed-receipt-warning').evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(239, 68, 68)');
    if(width===1280)await dialog.screenshot({path:path.join(web,'public/images/changelog/edit-nota-diproses.png')});
    assert.equal(await dialog.getByRole('button',{name:'Tetap edit nota',exact:true}).isDisabled(),true);
    await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Tetap edit nota',exact:true}).click();
    await dialog.getByLabel('Harga satuan baris 1',{exact:true}).fill('1e200');
    await dialog.getByLabel('Banyaknya baris 1',{exact:true}).fill('1e200');
    assert.equal(await dialog.getByRole('button',{name:'Tinjau perubahan',exact:true}).isVisible(),true,'overflowing input does not crash the editor');
    assert.deepEqual(errors,[]);
    await dialog.getByLabel('Banyaknya baris 1',{exact:true}).fill('1');
    await dialog.getByLabel('Harga satuan baris 1',{exact:true}).fill('100000');
    assert.equal((await dialog.getByLabel('Jumlah nota',{exact:true}).innerText()).replace(/\s/g,''),'100.000');
    await dialog.getByText('Baris dan pemakaian bahan',{exact:true}).click();
    await dialog.getByRole('button',{name:'Hubungkan stok',exact:true}).click();
    await dialog.getByRole('button',{name:/Flexi contoh/}).click({timeout:3000});
    await dialog.getByLabel('Jumlah pemakaian (m²)',{exact:true}).fill('2');
    await dialog.getByRole('button',{name:'Simpan hubungan',exact:true}).click();
    await page.waitForTimeout(800);
    assert.equal(calls.filter(c=>c.method==='PATCH').length,0,'processed edits must never autosave');
    await dialog.getByText(/Perubahan belum disimpan/).waitFor();
    failReview=true;await dialog.getByRole('button',{name:'Tinjau perubahan',exact:true}).click();
    await dialog.getByRole('alert').filter({hasText:'Pembayaran berubah'}).waitFor();failReview=false;
    await dialog.getByRole('button',{name:'Tinjau perubahan',exact:true}).click();
    await dialog.getByText('Rp 100.000',{exact:true}).first().waitFor();
    await dialog.getByText('Rp 75.000',{exact:true}).first().waitFor();
    await dialog.screenshot({path:path.join(output,`tinjau-${width}.png`)});
    failSave=true;await dialog.getByRole('button',{name:'Simpan dan perbarui transaksi',exact:true}).click();
    await dialog.getByRole('alert').filter({hasText:'Stok berubah'}).waitFor();failSave=false;
    assert.equal(await dialog.getByRole('button',{name:'Simpan dan perbarui transaksi',exact:true}).count(),0,'stale review must be discarded');
    await dialog.getByRole('button',{name:'Tinjau perubahan',exact:true}).click();
    await dialog.getByRole('button',{name:'Simpan dan perbarui transaksi',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    const invalidated=await page.evaluate(()=>window.invalidated);
    for(const key of ['customer-receivables','customer-recap','inventory-logs','stock-group','inventory-management','financial-report'])assert.ok(invalidated.includes(key),`refresh ${key} after correction`);
    assert.equal(calls.filter(c=>c.method==='PATCH'&&c.path.endsWith('/processed')).length,2);
    await page.getByRole('button',{name:'Edit nota diproses',exact:true}).click();dialog=page.getByRole('dialog',{name:'Edit nota diproses'});
    await dialog.getByRole('checkbox').check();await dialog.getByRole('button',{name:'Tetap edit nota',exact:true}).click();
    await dialog.getByLabel('Harga satuan baris 1',{exact:true}).fill('110000');await page.keyboard.press('Escape');
    await dialog.getByRole('button',{name:'Buang perubahan',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal(record.document.lines[0].price,100000);
    await page.getByRole('button',{name:'Edit nota diproses',exact:true}).click();
    await page.getByRole('dialog',{name:'Edit nota diproses'}).getByRole('button',{name:'Batal',exact:true}).focus();
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.closest('dialog')!==null),true,'keyboard focus stays inside confirmation');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal page overflow');
    await page.evaluate(()=>window.grantProcessedEdit(false));
    await page.getByRole('dialog',{name:'Edit nota diproses'}).waitFor({state:'hidden'});
    assert.deepEqual(errors,[]);await page.close();process.stdout.write(`PASS processed edit ${width}px: RBAC, warning, no autosave, review, errors, save, discard, keyboard and revocation\n`);
  }
}finally{await browser.close();esbuild.stop();}
