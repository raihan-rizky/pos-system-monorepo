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
    builder.onResolve({filter:/.*/},args=>args.kind==='dynamic-import' && !/ProductClassificationContainer|CategoryManagementTab/.test(args.path)?{path:args.path,namespace:'unused'}:undefined);
    builder.onLoad({filter:/.*/,namespace:'unused'},()=>({contents:`
      const Empty=()=>null; export default Empty;
      export const MoveProductsDialog=Empty,StockGroupWorkspaceModal=Empty,
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
  for (const { tab, permissions } of [
    { tab: '', permissions: [] },
    { tab: 'classification', permissions: ['create', 'delete'] },
    { tab: 'categories', permissions: ['create', 'update', 'delete'] },
  ]) {
    const page=await browser.newPage({viewport:{width:1200,height:850}}); page.setDefaultTimeout(4000); const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.setContent('<html lang="id"><body><div id="root"></div></body></html>');
    await page.evaluate(({ tab, permissions }) => {
      window.tabSearch = tab ? `tab=${tab}` : '';
      window.permissions = permissions;
      window.fetch=async input=>{
        const url=new URL(String(input),'http://localhost');
        const value=url.pathname==='/api/product-classification' ? {subcategories:[{id:'atk',group:'ATK',name:'Alat Tulis',legacyCategoryId:null}],legacyCategories:[]}
          : url.pathname==='/api/categories' ? []
          : url.pathname==='/api/product-classification/products' ? {groups:[{id:'p',name:'Pulpen',imageUrl:null,units:[{id:'p1',name:'Pulpen pcs',unit:'pcs',isActive:true,legacyCategoryName:'ATK',catalogSubcategory:null}]}],total:1,page:1,pageCount:1} : {};
        return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
      };
    }, { tab, permissions });
    const css=bundle.outputFiles.find(file=>file.path.endsWith('.css')); if(css)await page.addStyleTag({content:css.text});
    await page.addScriptTag({content:bundle.outputFiles.find(file=>file.path.endsWith('.js')).text});
    if (!tab) {
      await page.getByLabel('Kategori produk',{exact:true}).selectOption('ATK');
      await page.getByLabel('Subkategori',{exact:true}).selectOption('atk');
      assert.equal(await page.evaluate(()=>window.productQuery[2].catalogGroup),'ATK');
      assert.equal(await page.evaluate(()=>window.productQuery[2].catalogSubcategoryId),'atk');
      await page.getByLabel('Kategori produk',{exact:true}).selectOption('PERCETAKAN');
      assert.equal(await page.evaluate(()=>window.productQuery[2].catalogSubcategoryId),undefined);
      await page.setViewportSize({width:375,height:800});
      await page.getByLabel('Kategori produk',{exact:true}).focus();
      assert.equal(await page.getByLabel('Kategori produk',{exact:true}).evaluate(element=>document.activeElement===element),true);
      assert.equal(await page.getByLabel('Subkategori',{exact:true}).isVisible(),true);
      await page.getByRole('button', { name: 'Kategori', exact: true }).click();
    }
    await page.getByRole('heading', { name: 'Daftar produk' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Kategori', exact: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Kategori', exact: true, pressed: true }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Penataan kategori', exact: true }).count(), 0);

    const selectUnit = page.getByRole('checkbox', { name: 'Pilih semua satuan Pulpen' });
    const canUpdate = permissions.includes('update');
    assert.equal(await selectUnit.isDisabled(), !canUpdate);
    const manager = page.getByRole('region', { name: 'Kelola subkategori ATK' });
    if (permissions.includes('create')) {
      assert.equal(await manager.getByRole('button', { name: 'Tambah subkategori' }).count(), 1);
      assert.equal(await manager.getByRole('button', { name: 'Hapus Alat Tulis' }).count(), 1);
      assert.equal(await manager.getByRole('button', { name: 'Ubah Alat Tulis' }).count(), Number(canUpdate));
    } else {
      assert.equal(await manager.count(), 0);
    }

    const search = page.getByRole('searchbox', { name: 'Cari produk' });
    const status = page.getByRole('combobox', { name: 'Status klasifikasi' });
    await search.fill('Pulpen');
    await status.selectOption('unclassified');
    if (canUpdate) await selectUnit.check();

    const openLegacy = page.getByRole('button', { name: 'Kelola kategori lama' });
    await openLegacy.click();
    await page.getByRole('heading', { name: 'Kategori Produk' }).waitFor();
    assert.equal(await search.isVisible(), false);
    assert.equal(await page.getByRole('button', { name: 'Tambah Kategori', exact: true }).count(), Number(permissions.includes('create')));

    const backToProducts = page.getByRole('button', { name: 'Kembali ke daftar produk' });
    assert.equal(await backToProducts.evaluate(button => document.activeElement === button), true);
    await backToProducts.press('Enter');
    await search.waitFor();
    assert.equal(await search.inputValue(), 'Pulpen');
    assert.equal(await status.inputValue(), 'unclassified');
    assert.equal(await selectUnit.isChecked(), canUpdate);
    assert.equal(await openLegacy.evaluate(button => document.activeElement === button), true);
    assert.deepEqual(errors, []);
    await page.close();
  }
  process.stdout.write('PASS product page: merged categories, legacy and canonical links, permissions and preserved selection\n');
} finally {await browser.close()}
