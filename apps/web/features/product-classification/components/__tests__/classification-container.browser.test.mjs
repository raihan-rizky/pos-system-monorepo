// Local browser integration test with controlled HTTP fixtures; no product data is written.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
let bundle;
try {
  bundle = await build({
    stdin: { resolveDir: web, loader: "tsx", contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      import { ProductClassificationContainer } from './features/product-classification/components/ProductClassificationContainer';
      const unit = (id, name, isActive) => ({id,name,unit:'pcs',imageUrl:null,isActive,legacyCategoryName:'ATK',catalogSubcategory:null});
      const products = [
        {id:'p',name:'Pulpen',imageUrl:null,units:[unit('p1','Pulpen pcs',true),unit('p2','Pulpen pak',false)]},
        {id:'t',name:'Tinta',imageUrl:null,units:[unit('t1','Tinta botol',true)]},
        {id:'k',name:'Kertas',imageUrl:null,units:[unit('k1','Kertas lembar',true)]}
      ];
      const subcategories = [{id:'print',group:'PERCETAKAN',name:'PRINT',legacyCategoryId:null}, {id:'atk',group:'ATK',name:'Alat Tulis',legacyCategoryId:null}];
      const json = (body, status=200) => new Response(JSON.stringify(body), {status,headers:{'Content-Type':'application/json'}});
      window.requests=[]; window.holdPreview=false; window.failApply=false; window.failProducts=false; window.failDelete=false; window.malformedPreview=false;
      window.fetch = async (input, options={}) => {
        const url=new URL(String(input), 'http://localhost');
        if (url.pathname === '/api/product-classification') return json({subcategories,legacyCategories:[{id:'old',name:'ATK'}]});
        if (url.pathname === '/api/product-classification/products') {
          const search=url.searchParams.get('search') || '';
          window.requests.push({kind:'products',search,query:url.search});
          if(window.failProducts){window.failProducts=false;return json({message:'Produk gagal dimuat.'},500);}
          if(search === 'lambat') await new Promise(resolve => {window.releaseSlow=resolve});
          const matches=products.filter(group=>group.name.toLowerCase().includes(search.toLowerCase()));
          const page=Number(url.searchParams.get('page') || 1);
          return json({groups:matches.slice((page-1)*2,page*2),total:matches.length,page,pageCount:Math.max(1,Math.ceil(matches.length/2))});
        }
        if (url.pathname === '/api/product-classification/move') {
          const body=JSON.parse(options.body); window.requests.push({kind:body.action,body});
          if(body.action==='preview') {
            if(window.holdPreview) await new Promise(resolve=>{window.releasePreview=resolve});
            const selected=products.flatMap(group=>group.units).filter(item=>body.productIds.includes(item.id));
            return json({token:'token-preview',expiresAt:Date.now()+60000,target:subcategories[0],units:window.malformedPreview ? selected.map(()=>selected[0]) : selected,
              totals:{selected:selected.length,moving:selected.length,unchanged:0,active:selected.filter(item=>item.isActive).length,inactive:selected.filter(item=>!item.isActive).length},
              pricingImpact:{changed:0,examples:[]}});
          }
          if(window.failApply){window.failApply=false;return json({message:'Data berubah. Tinjau ulang.'},409);}
          return json({moved:body.productIds.length,unchanged:0});
        }
        if (url.pathname === '/api/product-classification/manage') {
          const body=JSON.parse(options.body); window.requests.push({kind:'manage',body});
          if(body.action==='delete' && window.failDelete){window.failDelete=false;return json({message:'Subkategori masih digunakan produk.'},409);}
          if(body.action==='create')subcategories.push({id:'new',group:'ATK',name:body.name,legacyCategoryId:null});
          if(body.action==='update')subcategories.find(item=>item.id===body.id).name=body.name;
          if(body.action==='delete')subcategories.splice(subcategories.findIndex(item=>item.id===body.id),1);
          return json({id:body.id || 'new'});
        }
        return json({message:'Unexpected request'},404);
      };
      const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});
      for(const key of ['products','categories','financial-report','daily-financial-report','customer-category-pricing-rules']) client.setQueryData([key],{cached:true});
      window.invalidated = key => client.getQueryState([key])?.isInvalidated;
      function Harness(){const [permissions,setPermissions]=useState({canCreate:true,canUpdate:true,canDelete:true}); window.setPermissions=setPermissions; window.setCanUpdate=value=>setPermissions({canCreate:false,canUpdate:value,canDelete:false}); return <QueryClientProvider client={client}><ProductClassificationContainer {...permissions}/></QueryClientProvider>}
      createRoot(document.getElementById('root')).render(<Harness/>);
    ` },
    bundle:true,write:false,outdir:'out',platform:'browser',format:'iife',jsx:'automatic',alias:{'@':web},
    define:{'process.env.NODE_ENV':'"production"'},
  });
} catch (error) {
  assert.fail(`Container klasifikasi harus dapat dirender untuk tes integrasi: ${error.message}`);
}

const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  const page=await browser.newPage({viewport:{width:1200,height:850}});
  page.setDefaultTimeout(5000);
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<html lang="id"><body><div id="root"></div></body></html>');
  const css=bundle.outputFiles.find(file=>file.path.endsWith('.css')); if(css) await page.addStyleTag({content:css.text});
  await page.addScriptTag({content:bundle.outputFiles.find(file=>file.path.endsWith('.js')).text});
  const pulpen=page.getByRole('checkbox',{name:'Pilih semua satuan Pulpen'});
  await pulpen.waitFor(); await pulpen.check();

  // A late response for an earlier search must not replace the current result.
  await page.getByLabel('Cari produk').fill('lambat');
  await page.waitForFunction(()=>typeof window.releaseSlow==='function');
  await page.getByLabel('Cari produk').fill('Tinta');
  await page.getByRole('checkbox',{name:'Pilih semua satuan Tinta'}).check();
  await page.evaluate(()=>window.releaseSlow());
  assert.equal(await page.getByRole('checkbox',{name:'Pilih semua satuan Tinta'}).count(),1);
  await page.getByLabel('Cari produk').fill('');
  await page.getByRole('button',{name:'Halaman berikutnya'}).click();
  await page.getByRole('checkbox',{name:'Pilih semua satuan Kertas'}).check();
  assert.match(await page.getByText(/4 satuan dipilih/).first().innerText(),/4 satuan dipilih/);
  await page.getByRole('radio',{name:'PERCETAKAN'}).check();
  await page.getByRole('radio',{name:'PRINT'}).check();
  const review=page.getByRole('button',{name:'Tinjau pemindahan'});

  // Selection changes while a preview is pending invalidate that response.
  await page.evaluate(()=>{window.holdPreview=true}); await review.click();
  await page.waitForFunction(()=>typeof window.releasePreview==='function');
  await page.getByRole('checkbox',{name:'Pilih semua satuan Kertas'}).uncheck();
  await page.evaluate(()=>{window.holdPreview=false;window.releasePreview()});
  await page.waitForTimeout(100);
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.getByRole('checkbox',{name:'Pilih semua satuan Kertas'}).check();

  // A malformed snapshot with duplicate IDs must never become a confirmable preview.
  await page.evaluate(()=>{window.malformedPreview=true}); await review.click();
  await page.getByRole('alert').filter({hasText:'Pratinjau tidak cocok'}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);
  await page.evaluate(()=>{window.malformedPreview=false});

  // A stale server snapshot closes the preview, retains selection, and never reports success.
  await page.evaluate(()=>{window.failApply=true}); await review.click();
  let dialog=page.getByRole('dialog',{name:'Tinjau pemindahan'}); await dialog.waitFor();
  await dialog.getByRole('button',{name:'Pindahkan satuan'}).click();
  await dialog.waitFor({state:'hidden'});
  await page.getByRole('alert').filter({hasText:'Data berubah'}).waitFor();
  assert.match(await page.getByText(/4 satuan dipilih/).first().innerText(),/4 satuan dipilih/);
  assert.equal(await page.evaluate(()=>window.invalidated('products')),false);

  // Apply must send precisely the IDs and destination from the successful preview.
  await review.click(); dialog=page.getByRole('dialog',{name:'Tinjau pemindahan'}); await dialog.waitFor();
  await dialog.getByRole('button',{name:'Pindahkan satuan'}).click(); await dialog.waitFor({state:'hidden'});
  await page.getByRole('status').filter({hasText:'4 satuan'}).waitFor();
  const actions=await page.evaluate(()=>window.requests.filter(item=>item.kind==='preview'||item.kind==='apply'));
  const preview=actions.filter(item=>item.kind==='preview').at(-1).body;
  const apply=actions.filter(item=>item.kind==='apply').at(-1).body;
  assert.deepEqual([...apply.productIds].sort(),['k1','p1','p2','t1']);
  assert.deepEqual([...apply.productIds].sort(),[...preview.productIds].sort());
  assert.equal(apply.subcategoryId,preview.subcategoryId); assert.equal(apply.token,'token-preview');
  for(const key of ['products','categories','financial-report','daily-financial-report','customer-category-pricing-rules'])
    assert.equal(await page.evaluate(name=>window.invalidated(name),key),true,`${key} cache should be invalidated`);
  assert.match(await page.getByText(/0 satuan dipilih/).first().innerText(),/0 satuan dipilih/);

  // ATK management creates, renames and removes only permitted entries; conflicts remain actionable.
  const manager=page.getByRole('region',{name:'Kelola subkategori ATK'});
  await manager.getByLabel('Nama subkategori ATK').fill('Barang baru');
  await manager.getByRole('button',{name:'Tambah subkategori'}).click();
  await manager.getByText('Barang baru',{exact:true}).waitFor();
  await manager.getByRole('button',{name:'Ubah Barang baru'}).click();
  await manager.getByLabel('Nama subkategori yang diubah').fill('Barang kantor');
  await manager.getByRole('button',{name:'Simpan perubahan'}).click();
  await manager.getByText('Barang kantor',{exact:true}).waitFor();
  await page.evaluate(()=>{window.failDelete=true});
  await manager.getByRole('button',{name:'Hapus Barang kantor'}).click();
  let deleteDialog=page.getByRole('dialog',{name:'Hapus subkategori ATK'});
  await deleteDialog.getByRole('button',{name:'Hapus subkategori'}).click();
  await deleteDialog.getByRole('alert').filter({hasText:'masih digunakan'}).waitFor();
  await deleteDialog.getByRole('button',{name:'Hapus subkategori'}).click();
  await deleteDialog.waitFor({state:'hidden'});
  await manager.getByText('Barang kantor',{exact:true}).waitFor({state:'detached'});
  assert.equal(await manager.getByText('Barang kantor',{exact:true}).count(),0);
  const managementActions=await page.evaluate(()=>window.requests.filter(item=>item.kind==='manage').map(item=>item.body));
  assert.deepEqual(managementActions,[{action:'create',name:'Barang baru'},{action:'update',id:'new',name:'Barang kantor'},{action:'delete',id:'new'},{action:'delete',id:'new'}]);
  await page.evaluate(()=>window.setPermissions({canCreate:false,canUpdate:false,canDelete:true}));
  assert.equal(await manager.getByRole('button',{name:'Tambah subkategori'}).count(),0);
  assert.equal(await manager.getByRole('button',{name:'Ubah Alat Tulis'}).count(),0);
  assert.equal(await manager.getByRole('button',{name:'Hapus Alat Tulis'}).count(),1);

  // Read-only users may browse filters and groups, but cannot preview or apply.
  await page.evaluate(()=>window.setCanUpdate(false));
  assert.equal(await page.getByRole('region',{name:'Kelola subkategori ATK'}).count(),0);
  assert.equal(await page.getByRole('checkbox',{name:'Pilih semua satuan Kertas'}).isDisabled(),true);
  assert.equal(await review.isDisabled(),true);
  await page.getByLabel('Cari produk').fill('Pulpen');
  await page.getByRole('checkbox',{name:'Pilih semua satuan Pulpen'}).waitFor();
  assert.equal(await page.getByRole('checkbox',{name:'Pilih semua satuan Pulpen'}).isDisabled(),true);

  // Fetch errors remain recoverable without losing the view.
  await page.evaluate(()=>{window.failProducts=true});
  await page.getByLabel('Cari produk').fill('Tinta');
  await page.getByRole('alert').filter({hasText:'Produk gagal dimuat'}).waitFor();
  await page.getByRole('button',{name:'Coba lagi'}).click();
  await page.getByRole('checkbox',{name:'Pilih semua satuan Tinta'}).waitFor();
  await page.setViewportSize({width:375,height:800});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  process.stdout.write('PASS classification container: permission, filters, request races, stale preview, bound apply, invalidation, retry and mobile\n');
} finally { await browser.close(); }
