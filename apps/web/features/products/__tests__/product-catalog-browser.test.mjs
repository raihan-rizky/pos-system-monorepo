// Run directly with node. Uses local fixtures without writing store data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repo = path.resolve(web, '../..');
const { build } = require(require.resolve('esbuild', { paths: [path.join(repo, 'node_modules/.pnpm/node_modules')] }));
const { chromium } = require('@playwright/test');
const postcss = require('postcss');
const tailwind = require('tailwindcss');
const description = 'Kopi bubuk pilihan untuk sehari-hari. Simpan di tempat sejuk dan kering. '.repeat(8);
const entry = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import ProductTable from './components/inventory/ProductTable';
import { ProductCatalogDetails } from './components/inventory/ProductCatalogDetails';
const product = {id:'coffee',name:'Kopi bubuk',sku:'KOPI',unit:'pcs',price:2000,costPrice:null,stock:12,minStock:1,isActive:true,description:${JSON.stringify(description)},category:{id:'food',name:'Makanan'},variants:[{unit:'pak',stock:0},{unit:'dus',stock:12},{unit:'PCS',stock:0}]};
const root = createRoot(document.getElementById('root'));
window.renderCatalog = grid => root.render(grid ? <article style={{width:'100%',maxWidth:300,padding:16}} onClick={()=>window.editCount++}><h2>Kopi bubuk</h2><ProductCatalogDetails product={product}/></article> : <ProductTable products={[product]} isLoading={false} onEdit={()=>window.editCount++} canUpdateProduct={true}/>);
window.editCount=0; window.renderCatalog(false);`;
const bundle = await build({ stdin:{contents:entry,resolveDir:web,loader:'tsx'}, bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic', alias:{'@':web,'@pos/ui':path.join(repo,'packages/ui/src/index.ts')},define:{'process.env.NODE_ENV':'"production"'} });
const files = ['components/inventory/ProductTable.tsx','components/inventory/ProductCatalogDetails.tsx','features/pos-product-variants/components/ProductDescriptionTooltip.tsx'];
const sources = await Promise.all(files.map(file=>readFile(path.join(web,file),'utf8')));
const css = await postcss([tailwind({content:sources.map(raw=>({raw,extension:'tsx'})),theme:{extend:{colors:{surface:require('tailwindcss/colors').slate,brand:require('tailwindcss/colors').blue}}}})]).process('@tailwind base; @tailwind utilities;',{from:undefined});
const browser = await chromium.launch({channel:'chrome',headless:true});
try {
  const page = await browser.newPage({viewport:{width:1000,height:650}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setContent('<html lang="id"><body><div id="root"></div></body></html>');
  await page.addStyleTag({content:css.css}); await page.addScriptTag({content:bundle.outputFiles[0].text});
  const visible = page.locator('[aria-label="Satuan tersedia"]:visible');
  await visible.waitFor();
  for (const width of [1000,375]) {
    await page.setViewportSize({width,height:650});
    assert.deepEqual((await visible.locator('span').allTextContents()).sort(),['dus','pak','pcs']);
    const colors=await visible.locator('span').evaluateAll(elements=>elements.map(e=>getComputedStyle(e).backgroundColor));
    assert.equal(new Set(colors).size,3);
    const span=page.locator('[aria-label="Deskripsi produk"]:visible span');
    assert.equal(await span.evaluate(e=>getComputedStyle(e).webkitLineClamp),'2');
    await page.locator('[aria-label="Deskripsi produk"]:visible').hover();
    const tooltip=page.getByRole('tooltip'); await tooltip.waitFor();
    assert.equal(await tooltip.textContent(),description.trim());
    const bounds=await tooltip.boundingBox(); assert.ok(bounds.x>=0 && bounds.x+bounds.width<=width);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await page.evaluate(()=>window.renderCatalog(true));
  const trigger=page.locator('article [aria-label="Deskripsi produk"]');
  await trigger.waitFor();
  await trigger.hover();
  await page.getByRole('tooltip').waitFor();
  await trigger.click();
  await page.getByRole('tooltip').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>window.editCount),0);
  await trigger.press('Enter');
  await page.getByRole('tooltip').waitFor();
  const contrast=await visible.locator('span').evaluateAll(elements=>elements.map(e=>{
    const luminance=color=>{
      const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(value=>{const v=value/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
      return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
    };
    const style=getComputedStyle(e), a=luminance(style.color), b=luminance(style.backgroundColor);
    return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  }));
  assert.ok(contrast.every(ratio=>ratio>=4.5));
  await page.keyboard.press('Escape');
  const screenshot=process.env.CATALOG_SCREENSHOT;
  if(screenshot) await page.screenshot({path:screenshot});
  assert.deepEqual(errors,[]);
  console.log('PASS catalog desktop/mobile: descriptions, distinct colors, wrapping, tooltip viewport and click isolation');
} finally {await browser.close();}
