import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const repo = process.cwd();
const web = path.join(repo, 'apps/web');
const require = createRequire(path.join(web, 'package.json'));
const { build } = require(require.resolve('esbuild', { paths: [path.join(repo, 'node_modules/.pnpm/node_modules')] }));
const { chromium } = require('@playwright/test');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const pageSource = await readFile(path.join(web, 'app/(main)/products/ProductsClientPage.tsx'), 'utf8');
const modules = {
  '@/hooks/useProducts': `
    const product={id:'paper',name:'Kertas',sku:'PAPER',unit:'pcs',price:2000,costPrice:null,stock:12,minStock:1,isActive:true,category:{id:'cat',name:'Kertas',icon:null,color:null}};
    const refetch=()=>{};
    export const useProductsPage=(search,categoryId,options)=>{
      window.lastProductQuery={search,categoryId,...options};
      const data=options.unit==='rim'?[]:[{...product,unit:options.unit||'pcs'}];
      const total=options.unit?data.length:41;
      return {data:{data,pagination:{page:options.page,limit:40,total,totalPages:options.unit?1:2}},isLoading:false,isFetching:false,refetch};
    };
    export const useProductUnits=()=>({data:['dus','pcs','rim'],isLoading:false,isError:false,refetch});
    export const useCategories=()=>({data:[]});
    export const useProductStats=()=>({data:{totalProducts:41,lowStock:0,negativeStock:0,inventoryValue:10000},refetch});
    export const useDeleteProduct=()=>({isPending:false});
    export const useBulkDeleteProducts=()=>({isPending:false});`,
  'next/navigation': `const params=new URLSearchParams(); export const useSearchParams=()=>params;`,
  '@/components/providers/RoleProvider': `export const useRole=()=>({canPerform:()=>false,role:'ADMIN'});`,
  '@/features/ai-assistant/hooks/useAssistantModalAction': `export const useAssistantModalAction=()=>{};`,
  '@/hooks/useCustomerCategoryPricingRules': `export const useCustomerCategoryPricingRules=()=>({data:[]});`,
  '@/features/product-import/hooks/useProductImport': `export const useActiveProductImportJob=()=>({data:null});export const useProductImportJobStatus=()=>({data:null});`,
};
const bundle=await build({
  stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import ProductsClientPage from './app/(main)/products/ProductsClientPage';createRoot(document.getElementById('root')).render(<ProductsClientPage/>);`,resolveDir:web,loader:'tsx'},
  bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',
  alias:{'@':web,'@pos/ui':path.join(repo,'packages/ui/src/index.ts')},define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'fixtures',setup(builder){
    builder.onResolve({filter:/.*/},args=>{
      if(modules[args.path])return {path:args.path,namespace:'fixture'};
      if(args.kind==='dynamic-import')return {path:'lazy',namespace:'fixture'};
    });
    builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='lazy'?`export default ()=>null;export const StockGroupWorkspaceModal=()=>null;export const CustomerCategoryPricingRulesTab=()=>null;export const ProductImportDrawer=()=>null;export const ProductImportProgressModal=()=>null;export const BulkStockImportDrawer=()=>null;export const BulkStockDrawer=()=>null;export const BulkStockGroupDrawer=()=>null;export const BulkPhotoImportDrawer=()=>null;export const SupplierCodeImportDrawer=()=>null;`:modules[args.path],loader:'js'}));
  }}],
});
const css=await postcss([tailwind({content:[{raw:pageSource,extension:'tsx'}]})]).process('@tailwind base;@tailwind utilities;',{from:undefined});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const width of [1280,375]) {
    await page.setViewportSize({width,height:900});
    await page.setContent('<html lang="id"><body><div id="root"></div></body></html>');
    await page.addStyleTag({content:css.css});await page.addScriptTag({content:bundle.outputFiles[0].text});
    await page.getByRole('button',{name:'Halaman berikutnya'}).click();
    assert.equal(await page.evaluate(()=>window.lastProductQuery.page),2);
    const filter=page.getByRole('button',{name:'Filter',exact:true});
    await filter.click();
    const select=page.getByLabel('Satuan',{exact:true});
    assert.deepEqual(await select.locator('option').allTextContents(),['Semua satuan','dus','pcs','rim']);
    await select.selectOption('dus');
    assert.deepEqual(await page.evaluate(()=>({unit:window.lastProductQuery.unit,page:window.lastProductQuery.page})),{unit:'dus',page:1});
    await filter.click();await page.getByRole('button',{name:'Reset',exact:true}).click();
    assert.equal(await select.inputValue(),'');
    await select.selectOption('rim');
    await page.getByRole('button',{name:'Hapus semua filter'}).click();
    assert.equal(await page.evaluate(()=>window.lastProductQuery.unit),'');
    await filter.click();
    await page.screenshot({path:path.join(repo,`output/playwright/product-unit-filter-${width}.png`)});
    assert.deepEqual(errors,[]);
  }
  console.log('PASS desktop/mobile product unit dropdown, global choices, reset pagination, Reset and Hapus semua filter');
} finally {
  await browser.close();
  require(require.resolve('esbuild', { paths: [path.join(repo, 'node_modules/.pnpm/node_modules')] })).stop();
}
