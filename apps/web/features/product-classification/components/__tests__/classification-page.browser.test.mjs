// Exercises the real Products page and classification container with local fixtures.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require=createRequire(import.meta.url);
const web=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const repo=path.resolve(web,'../..');
const {build}=require(require.resolve('esbuild',{paths:[path.join(repo,'node_modules/.pnpm/node_modules')]}));
const {chromium}=require('@playwright/test');
const bundle=await build({
  stdin:{resolveDir:web,loader:'tsx',contents:`
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import ProductsClientPage from './app/(main)/products/ProductsClientPage';
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><ProductsClientPage/></QueryClientProvider>);
  `},bundle:true,write:false,outdir:'out',platform:'browser',format:'iife',jsx:'automatic',
  alias:{'@':web,'@pos/ui':path.join(repo,'packages/ui/src/index.ts')},define:{'process.env.NODE_ENV':'"production"'},
  plugins:[{name:'fixtures',setup(builder){
    builder.onResolve({filter:/.*/},args=>args.kind==='dynamic-import' && !args.path.includes('ProductClassificationContainer')?{path:args.path,namespace:'unused'}:undefined);
    builder.onLoad({filter:/.*/,namespace:'unused'},()=>({contents:`
      const Empty=()=>null; export default Empty;
      export const CategoryManagementTab=Empty,MoveProductsDialog=Empty,StockGroupWorkspaceModal=Empty,
      CustomerCategoryPricingRulesTab=Empty,ProductImportDrawer=Empty,ProductImportProgressModal=Empty,
      BulkStockImportDrawer=Empty,BulkStockImportProgressModal=Empty,BulkStockDrawer=Empty,BulkStockGroupDrawer=Empty,
      BulkPhotoImportDrawer=Empty,SupplierCodeImportDrawer=Empty;
    `}));
    builder.onResolve({filter:/^(next\/navigation|@\/hooks\/useProducts|@\/hooks\/useCustomerCategoryPricingRules|@\/components\/providers\/RoleProvider|@\/features\/ai-assistant\/hooks\/useAssistantModalAction|@\/features\/product-import\/hooks\/useProductImport)$/},args=>({path:args.path,namespace:'queries'}));
    builder.onLoad({filter:/.*/,namespace:'queries'},()=>({resolveDir:web,loader:'js',contents:`
      const params=new URLSearchParams(window.tabSearch || ''); export const useSearchParams=()=>params;
      export const useRole=()=>({role:'CASHIER',canPerform:(_scope,action)=>action==='read'||window.permissions.includes(action),canAccess:()=>true});
      export const useAssistantModalAction=()=>{};
      export const useProductsPage=(...args)=>{window.productQuery=args;return {data:{data:[],pagination:{page:1,total:0,limit:40,totalPages:1}},isLoading:false,isFetching:false,refetch:()=>{}}};
      export const useCategories=()=>({data:[]}); export const useProductUnits=()=>({data:[]});
      export const useProductStats=()=>({data:{totalProducts:0,lowStock:0,negativeStock:0,inventoryValue:0},refetch:()=>{}});
      export const useDeleteProduct=()=>({reset:()=>{},isPending:false}); export const useBulkDeleteProducts=useDeleteProduct;
      export const useCustomerCategoryPricingRules=()=>({data:[]});
      export const useActiveProductImportJob=()=>({data:null,refetch:async()=>({data:null})}); export const useProductImportJobStatus=useActiveProductImportJob;
    `}));
  }}]
});
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const direct of [false,true]){
    const page=await browser.newPage({viewport:{width:1200,height:850}}); page.setDefaultTimeout(4000); const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<html lang="id"><body><div id="root"></div></body></html>');
    await page.evaluate(isDirect=>{
      window.tabSearch=isDirect?'tab=classification':'';
      window.permissions=isDirect?['create','delete']:[];
      window.fetch=async input=>{
        const url=new URL(String(input),'http://localhost');
        const value=url.pathname==='/api/product-classification' ? {subcategories:[{id:'atk',group:'ATK',name:'Alat Tulis',legacyCategoryId:null}],legacyCategories:[]}
          : url.pathname==='/api/product-classification/products' ? {groups:[{id:'p',name:'Pulpen',imageUrl:null,units:[{id:'p1',name:'Pulpen pcs',unit:'pcs',isActive:true,legacyCategoryName:'ATK',catalogSubcategory:null}]}],total:1,page:1,pageCount:1} : {};
        return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
      };
    },direct);
    const css=bundle.outputFiles.find(file=>file.path.endsWith('.css')); if(css)await page.addStyleTag({content:css.text});
    await page.addScriptTag({content:bundle.outputFiles.find(file=>file.path.endsWith('.js')).text});
    if(!direct) {
      await page.getByLabel('Kategori produk',{exact:true}).selectOption('ATK');
      await page.getByLabel('Subkategori produk',{exact:true}).selectOption('atk');
      assert.equal(await page.evaluate(()=>window.productQuery[2].catalogGroup),'ATK');
      assert.equal(await page.evaluate(()=>window.productQuery[2].catalogSubcategoryId),'atk');
      await page.getByLabel('Kategori produk',{exact:true}).selectOption('PERCETAKAN');
      assert.equal(await page.evaluate(()=>window.productQuery[2].catalogSubcategoryId),undefined);
      await page.setViewportSize({width:375,height:800});
      await page.getByLabel('Kategori produk',{exact:true}).focus();
      assert.equal(await page.getByLabel('Kategori produk',{exact:true}).evaluate(element=>document.activeElement===element),true);
      assert.equal(await page.getByLabel('Subkategori produk',{exact:true}).isVisible(),true);
      await page.getByRole('button',{name:'Penataan kategori'}).click();
    }
    await page.getByRole('heading',{name:'Tempat yang tepat untuk setiap produk.'}).waitFor();
    assert.equal(await page.getByRole('checkbox',{name:'Pilih semua satuan Pulpen'}).isDisabled(),true);
    const manager=page.getByRole('region',{name:'Kelola subkategori ATK'});
    if(direct){
      assert.equal(await manager.getByRole('button',{name:'Tambah subkategori'}).count(),1);
      assert.equal(await manager.getByRole('button',{name:'Hapus Alat Tulis'}).count(),1);
      assert.equal(await manager.getByRole('button',{name:'Ubah Alat Tulis'}).count(),0);
    } else assert.equal(await manager.count(),0);
    assert.deepEqual(errors,[]); await page.close();
  }
  process.stdout.write('PASS product page: classification tab, direct link and read-only permission\n');
} finally {await browser.close()}
