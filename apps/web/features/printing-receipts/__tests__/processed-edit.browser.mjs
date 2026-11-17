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
    window.grantProcessedEdit=setAllowed;const [paymentAllowed,setPaymentAllowed]=useState(false);window.grantPaymentAccess=setPaymentAllowed;return <Context.Provider value={{role:'ADMIN',userId:'u',storeId:'s',authorizationFingerprint:String(allowed),canPerform:(r,a)=>r==="printing_receipt.processed"?allowed:r==="customer.receivable"||r==="customer.receivable.payment"?paymentAllowed:r==="transaction"}}>{children}</Context.Provider>}`,
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
const initial = {id:"processed",storeId:"s",subcategory:"SPANDUK",number:"SP-CONTOH",revision:1,transactionId:"tx",createdAt:"2026-10-21T03:00:00Z",updatedAt:"2026-10-21T03:00:00Z",transaction:{id:"tx",subtotal:75000,discount:0,tax:0,total:75000,amountPaid:25000,change:0,status:"DP",paymentMethod:"CASH",salesName:"Sales Lama",salespersonId:"sales-1",payments:[{id:"pay-1",amount:20000,method:"CASH",createdAt:"2026-10-21T03:00:00Z"},{id:"pay-2",amount:5000,method:"TRANSFER",createdAt:"2026-10-21T03:01:00Z"}],debtPaymentLogs:[]},document:{title:"Contoh koreksi nota",customerName:"Pelanggan Contoh",customerPhone:"",customerId:null,date:"2026-10-21",note:"",completionDate:"",completionTime:"",receiver:"",setter:"",signatory:"Penanda tangan tetap",lines:[{id:"line",name:"Spanduk contoh",material:"Flexi",quantity:1,price:75000,stockLink:null}]}};
const output=path.join(repo,"output/playwright/printing-receipts/processed-edit");await mkdir(output,{recursive:true});
const changelogScreenshot=path.join(web,"public/images/changelog/edit-nota-pembayaran-tambahan.png");await mkdir(path.dirname(changelogScreenshot),{recursive:true});
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
      if(url.pathname==='/api/salespersons')return json({data:[{id:'sales-1',name:'Sales Lama'},{id:'sales-2',name:'Sales Baru'}]});
      const body=request.postDataJSON();calls.push({method,path:url.pathname,body});
      if(url.pathname==='/api/printing-receipts')return json({data:[record],pagination:{page:1,total:1,totalPages:1}});
      if(url.pathname==='/api/printing-receipts/processed')return json({data:record});
      if(url.pathname==='/api/printing-receipts/processed/processed'){
        if(method==='POST'){
          if(failReview)return json({message:'Pembayaran berubah. Tinjau ulang perubahan.'},409);
          const total=body.document.lines.reduce((sum,line)=>sum+(line.quantity??0)*(line.price??0),0);
          const additionalTotal=body.transaction.additionalPayments.reduce((sum,payment)=>sum+payment.amount,0);
          const initialTotal=body.transaction.initialPayments.reduce((sum,payment)=>sum+payment.amount,0);
          const sourcePayments=new Map(record.transaction.payments.map(payment=>[payment.id,payment]));
          const paid=25000+additionalTotal;
          const initialPayments=body.transaction.initialPayments.map(payment=>({...payment,beforeMethod:sourcePayments.get(payment.sourcePaymentId)?.method??record.transaction.paymentMethod}));
          const summaryMethod=initialPayments[0]?.method??record.transaction.paymentMethod;
          return json({data:{reviewToken:'review-token',before:{subtotal:75000,total:75000,paid:25000,debt:50000,status:'DP'},after:{subtotal:total,total,paid,debt:Math.max(0,total-paid),status:total>paid?'DP':'COMPLETED'},materials:[],transaction:{initialPayments,additionalPayments:body.transaction.additionalPayments,initialPaymentsBefore:25000,initialPaymentsAfter:initialTotal,additionalPaymentsTotal:additionalTotal,summaryPaymentMethod:{before:'CASH',after:summaryMethod},salesperson:{before:{id:'sales-1',name:'Sales Lama'},after:{id:body.transaction.salespersonId,name:'Sales Baru'}}}}});
        }
        if(method==='PATCH'){
          if(failSave)return json({message:'Stok berubah. Tinjau ulang perubahan.'},409);
          assert.equal(body.acknowledged,true);assert.equal(body.reviewToken,'review-token');
          const retained=new Set();const payments=body.transaction.initialPayments.map((payment,index)=>{const source=record.transaction.payments.find(row=>row.id===payment.sourcePaymentId);const id=source&&!retained.has(source.id)?source.id:"pay-new-"+index;if(source)retained.add(source.id);return{id,amount:payment.amount,method:payment.method,createdAt:source?.createdAt??record.transaction.createdAt}});const additionalTotal=body.transaction.additionalPayments.reduce((sum,payment)=>sum+payment.amount,0);const total=body.document.lines.reduce((sum,line)=>sum+(line.quantity??0)*(line.price??0),0);record={...record,document:body.document,revision:record.revision+1,transaction:{...record.transaction,total,amountPaid:record.transaction.amountPaid+additionalTotal,status:total>record.transaction.amountPaid+additionalTotal?"DP":"COMPLETED",paymentMethod:body.transaction.initialPayments[0]?.method??record.transaction.paymentMethod,salespersonId:body.transaction.salespersonId,salesName:"Sales Baru",payments,debtPaymentLogs:[...record.transaction.debtPaymentLogs,...body.transaction.additionalPayments.map((payment,index)=>({id:"debt-new-"+index,amount:payment.amount,paymentMethod:payment.method,createdAt:new Date().toISOString()}))]}};
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
    assert.equal(await dialog.getByRole('button',{name:'Tambah pembayaran tambahan',exact:true}).count(),0,'additional payment controls are hidden without receivable payment access');
    await page.evaluate(()=>window.grantPaymentAccess(true));
    await dialog.getByRole('button',{name:'Tambah pembayaran tambahan',exact:true}).waitFor();
    await dialog.getByRole('button',{name:'Pecah pembayaran awal 1',exact:true}).click();
    await dialog.getByLabel('Metode pembayaran 1',{exact:true}).selectOption('QRIS');
    await dialog.getByLabel('Nominal pembayaran 1',{exact:true}).fill('15000');
    await dialog.getByLabel('Metode pembayaran 1 pecahan 2',{exact:true}).selectOption('CASH');
    await dialog.getByLabel('Nominal pembayaran 1 pecahan 2',{exact:true}).fill('5000');
    await dialog.getByLabel('Sales transaksi',{exact:true}).selectOption('sales-2');
    await dialog.getByRole('button',{name:'Tambah pembayaran tambahan',exact:true}).click();
    await dialog.getByLabel('Metode pembayaran tambahan 1',{exact:true}).selectOption('TRANSFER');
    await dialog.getByLabel('Nominal pembayaran tambahan 1',{exact:true}).fill('10000');
    assert.equal(calls.filter(call=>call.method==='PATCH').length,0,'payment and transaction details must remain unsaved before review');
    if(width===1280){await page.setViewportSize({width,height:1800});const paymentRegion=dialog.getByRole('region',{name:'Data transaksi'});await paymentRegion.evaluate(el=>el.scrollIntoView({block:'start'}));await paymentRegion.screenshot({path:changelogScreenshot,animations:'disabled'});await page.setViewportSize({width,height:900});}
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
    await dialog.getByRole('paragraph').filter({hasText:'Alokasi pembayaran awal 1:'}).getByText('Tunai → QRIS',{exact:true}).waitFor();const additionalLine=dialog.getByRole('paragraph').filter({hasText:'Pembayaran tambahan 1:'});await additionalLine.waitFor();assert.ok((await additionalLine.innerText()).replace(/\s/g,'').includes('Rp10.000'));
    await dialog.getByText('Sales Lama → Sales Baru',{exact:true}).waitFor();
    assert.equal(calls.filter(call=>call.method==='PATCH').length,0,'review must not write transaction changes');
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
    const commit=calls.filter(call=>call.method==='PATCH'&&call.path.endsWith('/processed')).at(-1);
    assert.deepEqual(commit.body.transaction.initialPayments,[{sourcePaymentId:'pay-1',method:'QRIS',amount:15000},{sourcePaymentId:'pay-1',method:'CASH',amount:5000},{sourcePaymentId:'pay-2',method:'TRANSFER',amount:5000}]);
    assert.deepEqual(commit.body.transaction.additionalPayments,[{method:'TRANSFER',amount:10000}]);
    assert.equal(commit.body.transaction.salespersonId,'sales-2');
    assert.equal(commit.body.document.signatory,'Penanda tangan tetap');
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
