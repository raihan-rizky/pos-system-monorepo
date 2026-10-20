// Run with Node. Real Products page, in-memory query fixtures; no store writes.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repo = path.resolve(web, '../..');
const { build } = require(require.resolve('esbuild', { paths: [path.join(repo, 'node_modules/.pnpm/node_modules')] }));
const { chromium } = require('@playwright/test');
const postcss = require('postcss'), tailwind = require('tailwindcss');
const bundle = await build({
  stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import ProductsClientPage from './app/(main)/products/ProductsClientPage';
    createRoot(document.getElementById('root')).render(<ProductsClientPage/>);
  `, resolveDir: web, loader: 'tsx' },
  bundle:true, write:false, platform:'browser', format:'iife', jsx:'automatic',
  alias:{'@':web,'@pos/ui':path.join(repo,'packages/ui/src/index.ts')},
  define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'navigation-fixtures',setup(builder){
    builder.onResolve({filter:/.*/},args=>args.kind==='dynamic-import'?{path:args.path,namespace:'unused-dialog'}:undefined);
    builder.onLoad({filter:/.*/,namespace:'unused-dialog'},()=>({contents:`
      const Empty=()=>null; export default Empty;
      export const CategoryManagementTab=Empty,MoveProductsDialog=Empty,StockGroupWorkspaceModal=Empty,
        CustomerCategoryPricingRulesTab=Empty,ProductImportDrawer=Empty,ProductImportProgressModal=Empty,
        BulkStockImportDrawer=Empty,BulkStockDrawer=Empty,BulkStockGroupDrawer=Empty,
        BulkPhotoImportDrawer=Empty,SupplierCodeImportDrawer=Empty;
    `}));
    builder.onResolve({filter:/^(next\/navigation|@\/hooks\/useProducts|@\/hooks\/useCustomerCategoryPricingRules|@\/components\/providers\/RoleProvider|@\/features\/ai-assistant\/hooks\/useAssistantModalAction|@\/features\/product-import\/hooks\/useProductImport)$/},args=>({path:args.path,namespace:'queries'}));
    builder.onLoad({filter:/.*/,namespace:'queries'},()=>({contents:`
      import {useState,useEffect} from 'react';
      const params=new URLSearchParams(); export const useSearchParams=()=>params;
      export const useRole=()=>({role:'OWNER',canPerform:()=>true,canAccess:()=>true});
      export const useAssistantModalAction=()=>{};
      const products=Array.from({length:40},(_,i)=>({id:'example-'+i,name:'Produk Contoh '+String(i+1).padStart(2,'0'),
        sku:'CONTOH-'+i,unit:'pcs',price:2000,costPrice:1000,stock:20,minStock:1,isActive:true,
        category:{id:'paper',name:'Kertas'},variants:[]}));
      Object.assign(products[0],{name:'Alas Mouse Pad',price:13500,costPrice:10000});
      Object.assign(products[1],{price:13500,costPrice:10000,category:{id:'special',name:'Harga khusus'}});
      Object.assign(products[2],{price:13500,costPrice:0});
      Object.assign(products[3],{price:8000,costPrice:10000});
      export function useProductsPage(search,category,{page}) {
        const [loaded,setLoaded]=useState(page);
        useEffect(()=>{const id=setTimeout(()=>setLoaded(page),180);return()=>clearTimeout(id)},[page]);
        return {data:{data:products,pagination:{page:loaded,total:120,limit:40,totalPages:3}},isLoading:false,isFetching:loaded!==page,refetch:()=>{}};
      }
      export const useCategories=()=>({data:[{id:'paper',name:'Kertas',_count:{products:120}}]});
      export const useProductUnits=()=>({data:['pcs']});
      export const useProductStats=()=>({data:{totalProducts:120,lowStock:0,negativeStock:0,inventoryValue:240000},refetch:()=>{}});
      export const useDeleteProduct=()=>({reset:()=>{},isPending:false});
      export const useBulkDeleteProducts=useDeleteProduct;
      export const useCustomerCategoryPricingRules=()=>({data:[{id:'special-rule',categoryId:'special',category:{id:'special',name:'Harga khusus'},customerType:'UMUM',mode:'FLAT_DISCOUNT',value:1500,isActive:true}]});
      export const useActiveProductImportJob=()=>({data:null,refetch:async()=>({data:null})});
      export const useProductImportJobStatus=useActiveProductImportJob;
    `,loader:'js',resolveDir:web}));
  }}]
});
const files=['app/(main)/products/ProductsClientPage.tsx','components/inventory/ProductTable.tsx','components/inventory/ProductCatalogDetails.tsx','components/ui/HorizontalScroll/HorizontalScroll.tsx'];
const sources=await Promise.all(files.map(file=>readFile(path.join(web,file),'utf8')));
const css=await postcss([tailwind({content:sources.map(raw=>({raw,extension:'tsx'})),theme:{extend:{colors:{brand:require('tailwindcss/colors').blue,surface:require('tailwindcss/colors').slate}}}})]).process('@tailwind base; @tailwind utilities;',{from:undefined});
const artifacts=path.join(repo,'output/playwright/product-navigation'); await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1280,height:850}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<html lang="id"><body><main style="display:flex;height:100dvh;overflow:hidden"><div id="root" style="display:flex;flex:1;min-width:0"></div></main></body></html>');
  await page.addStyleTag({content:css.css}); await page.addScriptTag({content:bundle.outputFiles[0].text});
  const pagers=page.getByRole('navigation',{name:/Pagination produk/}); await pagers.first().waitFor();
  const verifyMarkup=async()=>{
    for(const pattern of [/^Markup: Rp\s*3\.500 \(35%\)$/,/^Markup: Rp\s*2\.000 \(20%\)$/,/^Markup: Rp\s*13\.500 \(—\)$/,/^Markup: -Rp\s*2\.000 \(-20%\)\s*Di bawah HPP$/]){
      const matches=page.getByText(pattern).filter({visible:true});
      assert.equal(await matches.count(),1,'visible markup in the actual product view: '+pattern+' '+JSON.stringify(await matches.evaluateAll(elements=>elements.map(el=>({tag:el.tagName,text:el.textContent,parent:el.parentElement.textContent})))));
    }
    assert.equal(await page.getByText(/^Margin:/).filter({visible:true}).count(),0,'product view no longer labels markup as margin');
  };
  await verifyMarkup();
  assert.equal(await pagers.count(),2,'pagination available above and below products');
  const top=pagers.first(),bottom=pagers.last();
  assert.equal(await top.evaluate(el=>Boolean(el.compareDocumentPosition(document.querySelector('[aria-label="Satuan tersedia"]'))&Node.DOCUMENT_POSITION_FOLLOWING)),true,'top pagination precedes cards');
  assert.equal(await top.getByRole('button',{name:'Halaman sebelumnya'}).isDisabled(),true);
  const waitPage=number=>page.waitForFunction(n=>[...document.querySelectorAll('[aria-current="page"]')].every(el=>el.textContent.replace(/\s/g,'')==='Halaman'+n+'/3'),number);
  await top.getByRole('button',{name:'Halaman berikutnya'}).click(); await waitPage(2);
  await bottom.getByRole('button',{name:'Halaman berikutnya'}).click(); await waitPage(3);
  assert.equal(await top.getByRole('button',{name:'Halaman berikutnya'}).isDisabled(),true);
  await bottom.getByRole('button',{name:'Halaman sebelumnya'}).click(); await waitPage(2);
  const scroller=page.locator('div.overflow-y-auto').first(),up=page.getByRole('button',{name:'Kembali ke atas',exact:true});
  await scroller.evaluate(el=>el.scrollTo({top:0,behavior:'instant'})); await up.waitFor({state:'hidden'});
  await scroller.evaluate(el=>el.scrollTo({top:el.clientHeight-1,behavior:'instant'}));
  assert.equal(await up.count(),0,'hidden before one viewport of scroll');
  await scroller.evaluate(el=>el.scrollTo({top:el.clientHeight+10,behavior:'instant'})); await up.waitFor();
  await scroller.evaluate(el=>{const native=el.scrollTo.bind(el);el.scrollTo=options=>{window.lastScroll=options;native(options)}});
  await up.focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>window.lastScroll.behavior),'smooth');
  await page.waitForFunction(()=>document.querySelector('div.overflow-y-auto').scrollTop===0); await up.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.scrollY),0,'scroll container instead of document');
  await page.emulateMedia({reducedMotion:'reduce'}); await scroller.evaluate(el=>el.scrollTop=el.scrollHeight); await up.waitFor(); await up.click();
  assert.equal(await page.evaluate(()=>window.lastScroll.behavior),'instant');
  await page.waitForFunction(()=>document.querySelector('div.overflow-y-auto').scrollTop===0);
  for(const width of [320,390,1280]){
    await page.setViewportSize({width,height:850}); await scroller.evaluate(el=>el.scrollTop=0); await top.scrollIntoViewIfNeeded();
    await verifyMarkup();
    await page.getByText('Alas Mouse Pad',{exact:true}).locator('xpath=ancestor::div[contains(@class,"group")][1]').screenshot({path:path.join(artifacts,'markup-card-'+width+'.png')});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal page overflow at '+width);
    const bounds=await top.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width,'pager fits '+width);
    await top.screenshot({path:path.join(artifacts,'pagination-'+width+'.png')});
    await scroller.evaluate(el=>el.scrollTop=el.scrollHeight);await up.waitFor();
    const arrow=await up.boundingBox();assert.ok(arrow.x>=0&&arrow.x+arrow.width<=width&&arrow.y>=0);
    assert.ok(arrow.y+arrow.height<850-(width<768?160:88),'clears assistant and mobile nav');
  }
  await scroller.evaluate(el=>el.scrollTop=0);
  await page.getByRole('button',{name:'table',exact:true}).click();
  await verifyMarkup();
  assert.equal(await pagers.count(),2,'table view keeps both pagers');
  assert.deepEqual(errors,[]);
  console.log('PASS: actual grid/table markup (35%, special price, zero HPP, loss), both pagers, synchronization, boundaries, internal smooth scroll, reduced motion, keyboard and 320/390/1280px layouts.');
} finally {await browser.close();}
