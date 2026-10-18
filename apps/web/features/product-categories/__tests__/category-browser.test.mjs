// Exercise the real components with local fixtures; never write store data.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const entry = `
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {CategoryManagementTab} from './features/product-categories/components/CategoryManagementTab';
import {MoveProductsDialog} from './features/product-categories/components/MoveProductsDialog';
const category=(id,name,count=0)=>({id,name,icon:'package',color:null,order:0,salesGroup:'OTHER',_count:{products:count}});
window.categories=[category('old','Alat Tulis',2),category('other','Lama Dua',1),category('target','ATK')];
window.actions=[];window.staleOnce=false;
const stores=[{id:'s1',name:'Toko Pusat',products:2,rules:1},{id:'s2',name:'Toko Cabang',products:1,rules:0}];
window.fetch=async(url,options={})=>{
 if(!options.method)return new Response(JSON.stringify({data:window.categories}),{status:200});
 const input=JSON.parse(options.body);window.actions.push(input);
 if(input.action==='create'){
  if(input.categories.some(c=>c.name==='Duplikat'))return new Response(JSON.stringify({message:'Nama kategori sudah digunakan',errors:{'categories.1.name':['Nama kategori sudah digunakan; pilih nama lain']}}),{status:409});
  window.categories.push(...input.categories.map((c,i)=>({...c,id:'new'+i,_count:{products:0}})));return new Response(JSON.stringify({message:'Kategori berhasil ditambahkan.'}));
 }
 if(input.action==='update'){
  const duplicate=input.categories.findIndex(c=>c.name==='Duplikat');
  if(duplicate>=0)return new Response(JSON.stringify({message:'Nama kategori sudah digunakan',errors:{['categories.'+duplicate+'.name']:['Nama kategori sudah digunakan; pilih nama lain']}}),{status:409});
  if(input.categories.some(c=>!window.categories.some(current=>current.id===c.id)))return new Response(JSON.stringify({message:'Kategori sudah berubah. Muat ulang data.'}),{status:409});
  for(const patch of input.categories)Object.assign(window.categories.find(c=>c.id===patch.id),patch);return new Response(JSON.stringify({message:'Kategori berhasil diubah.'}));
 }
 if(input.action==='preview-delete'){
  const categories=input.categoryIds.map(id=>{const source=window.categories.find(c=>c.id===id),target=window.categories.find(c=>c.id===input.destinations[id]);return {id,name:source.name,targetCategoryId:target?.id??null,targetCategoryName:target?.name??null,products:source._count.products,activeProducts:id==='old'?1:1,inactiveProducts:id==='old'?1:0,stores:[stores[id==='old'?0:1]],rules:id==='old'?[{id:'r1',storeId:'s1',storeName:'Toko Pusat',customerTypes:['AGEN'],unit:'pcs',brandName:'Joyko',mode:'FIXED_PRICE',value:'1000',isActive:false}]:[]};});
  return new Response(JSON.stringify({kind:'delete',token:'signed-fixture',expiresAt:Date.now()+600000,categories,totals:{categories:categories.length,products:categories.reduce((n,c)=>n+c.products,0),activeProducts:categories.reduce((n,c)=>n+c.activeProducts,0),inactiveProducts:categories.reduce((n,c)=>n+c.inactiveProducts,0),rules:categories.reduce((n,c)=>n+c.rules.length,0),stores:2},stores}));
 }
 if(input.action==='delete'){
  if(window.staleOnce){window.staleOnce=false;return new Response(JSON.stringify({message:'Data berubah. Tinjau ulang dampaknya.'}),{status:409});}
  window.categories=window.categories.filter(c=>!input.categoryIds.includes(c.id));return new Response(JSON.stringify({message:'Kategori berhasil dihapus.',deletedCategories:input.categoryIds.length,movedProducts:3,deletedRules:1}));
 }
 if(input.action==='preview-move')return new Response(JSON.stringify({kind:'move',token:'move-fixture',expiresAt:Date.now()+600000,targetCategoryId:input.targetCategoryId,targetCategoryName:'ATK',totals:{products:1,unchanged:1},origins:[{id:'old',name:'Alat Tulis',products:1},{id:'target',name:'ATK',products:1}]}));
 return new Response(JSON.stringify({message:'Produk berhasil dipindahkan.',movedProducts:1,unchangedProducts:1}));
};
const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
window.refreshCategories=()=>client.invalidateQueries({queryKey:['categories']});
function App(){const [move,setMove]=useState(false);return <QueryClientProvider client={client}><main className="mx-auto max-w-5xl space-y-5 p-4"><button onClick={()=>setMove(true)}>Pindah produk pilihan</button><CategoryManagementTab canCreate canUpdate canDelete onDeleted={ids=>window.deleted=ids}/>{move&&<MoveProductsDialog productIds={['p1','p2']} onClose={()=>setMove(false)} onMoved={message=>{window.moveResult=message;setMove(false)}}/>}</main></QueryClientProvider>}
createRoot(document.getElementById('root')).render(<App/>);`;
const bundle = await build({ stdin: { contents: entry, resolveDir: web, loader: "tsx" }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", alias: { "@": web }, define: { "process.env.NODE_ENV": '"production"' } });
const files = (await readdir(path.join(web, "features/product-categories/components")))
  .filter(name => name.endsWith(".tsx"))
  .map(name => `features/product-categories/components/${name}`);
const sources = await Promise.all(files.map(file => readFile(path.join(web, file), "utf8")));
const css = await postcss([tailwind({ content: sources.map(raw => ({ raw, extension: "tsx" })) })]).process("@tailwind base; @tailwind utilities;", { from: undefined });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const screenshotDir = process.env.CATEGORY_VISUAL_SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.setContent('<html lang="id"><body><div id="root"></div></body></html>', { waitUntil: "domcontentloaded" });
  await page.addStyleTag({ content: css.css });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByRole("heading", { name: "Kategori Produk", exact: true }).waitFor();
  await page.getByLabel("Pilih Alat Tulis", { exact: true }).waitFor();

  await page.evaluate(() => {
    const fixtureFetch = window.fetch;
    window.managementRequests = [];
    window.failNextAction = null;
    window.holdNextAction = null;
    window.fetch = async (url, options = {}) => {
      const input = options.body ? JSON.parse(options.body) : null;
      if (input) window.managementRequests.push(input);
      if (input?.action === window.failNextAction) {
        window.failNextAction = null;
        throw new TypeError("Connection reset");
      }
      if (input?.action === window.holdNextAction) {
        window.holdNextAction = null;
        await new Promise(resolve => { window.releaseAction = resolve; });
      }
      const response = await fixtureFetch(url, options);
      if (input?.action === "preview-move" && window.expireNextPreview) {
        window.expireNextPreview = false;
        const preview = await response.json();
        return new Response(JSON.stringify({ ...preview, expiresAt: Date.now() + 500 }));
      }
      return response;
    };
  });

  // Native validation rejects invalid rows before any request reaches the server.
  assert.equal(await page.getByRole("button", { name: "Ubah Pilihan", exact: true }).isEnabled(), false);
  assert.equal(await page.getByRole("button", { name: "Hapus Pilihan", exact: true }).isEnabled(), false);
  await page.getByRole("button", { name: "Tambah Kategori", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Simpan Kategori", exact: true }).click();
  assert.equal(await dialog.getByLabel("Nama kategori 1", { exact: true }).evaluate(input => input.validity.valueMissing), true);
  await dialog.getByLabel("Nama kategori 1", { exact: true }).fill("Draf belum disimpan");
  // Pickers keep their drafts local until a valid choice is applied.
  const colorTrigger = dialog.getByRole("button", { name: "Warna 1", exact: true });
  await colorTrigger.click({ timeout: 2000 });
  const colorPicker = page.getByRole("dialog", { name: "Pilih warna kategori", exact: true });
  await colorPicker.getByLabel("Kode warna", { exact: true }).fill("merah");
  assert.equal(await colorPicker.getByLabel("Kode warna", { exact: true }).getAttribute("aria-invalid"), "true");
  assert.equal(await colorPicker.getByRole("button", { name: "Terapkan warna", exact: true }).isEnabled(), false);
  await colorPicker.getByLabel("Kode warna", { exact: true }).fill("#123abc");
  await colorPicker.getByLabel("Kode warna", { exact: true }).press("Enter");
  assert.equal(await colorPicker.isVisible(), true);
  assert.deepEqual(await page.evaluate(() => window.managementRequests), []);
  await colorPicker.getByRole("button", { name: "Terapkan warna", exact: true }).click();
  await colorPicker.waitFor({ state: "hidden" });
  await dialog.getByText("Pengaturan tambahan 1", { exact: true }).click();
  await dialog.getByLabel("Urutan 1", { exact: true }).fill("-1");
  await dialog.getByRole("button", { name: "Simpan Kategori", exact: true }).click();
  assert.equal(await dialog.getByLabel("Urutan 1", { exact: true }).evaluate(input => input.validity.rangeUnderflow), true);
  assert.deepEqual(await page.evaluate(() => window.managementRequests), []);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  // Search and select-all retain explicit selections that are outside the filter.
  await page.getByLabel("Pilih Alat Tulis", { exact: true }).check();
  const search = page.getByLabel("Cari kategori", { exact: true });
  await search.fill("LAMA");
  await page.getByLabel("Pilih semua kategori yang terlihat", { exact: true }).check();
  await page.getByText("2 kategori dipilih (1 terlihat)", { exact: true }).waitFor();
  await search.fill("Tidak ada kategori ini");
  await page.getByText("2 kategori dipilih (0 terlihat)", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Pilih semua kategori yang terlihat", { exact: true }).count(), 0);
  await search.fill("lama");
  await page.getByLabel("Pilih semua kategori yang terlihat", { exact: true }).uncheck();
  await search.fill("");
  assert.equal(await page.getByLabel("Pilih Alat Tulis", { exact: true }).isChecked(), true);
  assert.equal(await page.getByLabel("Pilih Lama Dua", { exact: true }).isChecked(), false);

  // Saving an unchanged edit closes the dialog without issuing an empty update.
  await page.getByLabel("Pilih Alat Tulis", { exact: true }).check();
  await page.getByRole("button", { name: "Ubah Pilihan", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Simpan Kategori", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(await page.evaluate(() => window.managementRequests), []);
  await page.getByRole("button", { name: "Bersihkan Pilihan", exact: true }).click();

  // Batch creation and per-row validation preserve all draft inputs.
  await page.getByRole("button", { name: "Tambah Kategori", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama kategori 1", { exact: true }).fill("Buku");
  // Visual icon choices support both Indonesian and English searches, replacement,
  // removal, and keyboard dismissal without closing the category editor.
  const iconTrigger = dialog.getByRole("button", { name: "Ikon 1", exact: true });
  await iconTrigger.click();
  const iconPicker = page.getByRole("dialog", { name: "Pilih ikon kategori", exact: true });
  const iconSearch = iconPicker.getByPlaceholder("Cari ikon...", { exact: true });
  for (const width of [1100, 375]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await iconPicker.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `category-icon-picker-${width}.png`) });
  }
  await page.setViewportSize({ width: 1100, height: 850 });
  await iconSearch.fill("kopi");
  await iconPicker.getByRole("button", { name: "Kopi", exact: true }).waitFor();
  await iconSearch.fill("coffee");
  await iconPicker.getByRole("button", { name: "Kopi", exact: true }).waitFor();
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "category-icon-picker.png") });
  await iconSearch.fill("ikon-yang-tidak-ada-123");
  await iconPicker.getByText(/Ikon tidak ditemukan/).waitFor();
  assert.equal(await iconPicker.getByRole("button", { name: "Kopi", exact: true }).count(), 0);
  await iconSearch.fill("coffee");
  await iconPicker.getByRole("button", { name: "Kopi", exact: true }).click();
  await iconPicker.waitFor({ state: "hidden" });
  assert.match(await iconTrigger.innerText(), /Kopi/);
  assert.equal(await iconTrigger.evaluate(element => element === document.activeElement), true);
  await iconTrigger.click();
  await iconSearch.fill("printer");
  await iconPicker.getByRole("button", { name: "Printer", exact: true }).click();
  assert.match(await iconTrigger.innerText(), /Printer/);
  await iconTrigger.click();
  await iconPicker.getByRole("button", { name: "Hapus ikon", exact: true }).click();
  await iconPicker.waitFor({ state: "hidden" });
  assert.match(await iconTrigger.innerText(), /Ikon bawaan/);
  await iconTrigger.click();
  await page.keyboard.press("Escape");
  await iconPicker.waitFor({ state: "hidden" });
  assert.equal(await dialog.isVisible(), true);
  assert.equal(await iconTrigger.evaluate(element => element === document.activeElement), true);
  await iconTrigger.click();
  await iconSearch.fill("coffee");
  await iconPicker.getByRole("button", { name: "Kopi", exact: true }).click();

  await dialog.getByRole("button", { name: "Warna 1", exact: true }).click();
  await colorPicker.getByRole("button", { name: "Biru", exact: true }).click();
  assert.equal(await colorPicker.getByLabel("Kode warna", { exact: true }).inputValue(), "#2563eb");
  if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, "category-color-picker.png") });
  await colorPicker.getByRole("button", { name: "Terapkan warna", exact: true }).click();
  await colorPicker.waitFor({ state: "hidden" });
  assert.match(await dialog.getByRole("button", { name: "Warna 1", exact: true }).innerText(), /Biru/);
  await dialog.getByRole("button", { name: "Warna 1", exact: true }).click();
  await colorPicker.getByRole("button", { name: "Hapus warna", exact: true }).click();
  assert.equal(await colorPicker.getByLabel("Kode warna", { exact: true }).inputValue(), "");
  await colorPicker.getByRole("button", { name: "Terapkan warna", exact: true }).click();
  await colorPicker.waitFor({ state: "hidden" });
  assert.match(await dialog.getByRole("button", { name: "Warna 1", exact: true }).innerText(), /Bawaan/);
  await dialog.getByRole("button", { name: "Warna 1", exact: true }).click();
  await colorPicker.getByLabel("Kode warna", { exact: true }).fill("#123abc");
  await colorPicker.getByRole("button", { name: "Terapkan warna", exact: true }).click();
  await dialog.getByRole("button", { name: "Tambah Baris", exact: true }).click();
  await dialog.getByLabel("Nama kategori 2", { exact: true }).fill("Duplikat");
  await page.evaluate(() => { window.failNextAction = "create"; });
  await dialog.getByRole("button", { name: "Simpan Kategori", exact: true }).click();
  await dialog.getByRole("alert").filter({ hasText: "Periksa koneksi internet" }).waitFor();
  assert.equal(await dialog.getByLabel("Nama kategori 1", { exact: true }).inputValue(), "Buku");
  assert.equal(await dialog.getByLabel("Nama kategori 2", { exact: true }).inputValue(), "Duplikat");
  await dialog.getByRole("button", { name: "Simpan Kategori", exact: true }).click();
  await dialog.getByRole("alert").filter({ hasText: "Nama kategori sudah digunakan" }).waitFor();
  assert.equal(await dialog.getByLabel("Nama kategori 1", { exact: true }).inputValue(), "Buku");
  await dialog.getByLabel("Nama kategori 2", { exact: true }).fill("Tinta");
  await page.evaluate(() => { window.holdNextAction = "create"; });
  await dialog.getByRole("button", { name: "Simpan Kategori", exact: true }).click();
  const pendingSave = dialog.getByRole("button", { name: "Simpan Kategori", exact: true });
  await page.waitForFunction(() => !!document.querySelector('dialog button[aria-label="Simpan Kategori"]')?.disabled);
  assert.equal(await pendingSave.isEnabled(), false);
  assert.equal(await dialog.getByLabel("Nama kategori 1", { exact: true }).isEnabled(), false);
  assert.equal(await dialog.getByRole("button", { name: "Ikon 1", exact: true }).isEnabled(), false);
  assert.equal(await dialog.getByRole("button", { name: "Warna 1", exact: true }).isEnabled(), false);
  for (const cancel of await dialog.getByRole("button", { name: "Batal", exact: true }).all()) assert.equal(await cancel.isEnabled(), false);
  await page.keyboard.press("Escape");
  assert.equal(await dialog.isVisible(), true);
  await pendingSave.evaluate(button => { button.click(); button.click(); });
  assert.equal(await page.evaluate(() => window.managementRequests.filter(action => action.action === "create").length), 3);
  await page.evaluate(() => window.releaseAction());
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(await page.evaluate(() => {
    const created = window.actions.filter(action => action.action === "create").at(-1).categories;
    return created.map(({ name, icon, color }) => ({ name, icon, color }));
  }), [
    { name: "Buku", icon: "coffee", color: "#123abc" },
    { name: "Tinta", icon: null, color: null },
  ]);
  await page.getByLabel("Pilih Buku", { exact: true }).waitFor();
  await page.getByLabel("Pilih Buku", { exact: true }).check();
  await page.getByRole("button", { name: "Ubah Pilihan", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama kategori 1", { exact: true }).fill("Buku Tulis");
  await dialog.getByRole("button", { name: "Simpan Kategori", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(await page.evaluate(() => window.actions.find(action => action.action === "update").categories), [{ id: "new0", name: "Buku Tulis" }]);

  // Partial-patch error paths map to the original rows; refetch cannot replace editor baselines.
  await page.getByLabel("Pilih Alat Tulis", { exact: true }).check();
  await page.getByLabel("Pilih Lama Dua", { exact: true }).check();
  await page.getByRole("button", { name: "Ubah Pilihan", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama kategori 2", { exact: true }).fill("Duplikat");
  await dialog.getByRole("button", { name: "Simpan Kategori", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  assert.equal(await dialog.getByRole("row", { name: "Kategori 1", exact: true }).getByRole("list").count(), 0);
  assert.equal(await dialog.getByRole("row", { name: "Kategori 2", exact: true }).getByRole("list").count(), 1);
  assert.equal(await dialog.getByLabel("Nama kategori 2", { exact: true }).getAttribute("aria-invalid"), "true");
  await dialog.getByLabel("Nama kategori 2", { exact: true }).fill("Lama Dua");
  await page.evaluate(async () => { window.categories.find(c => c.id === "old").color = "#ff0000"; window.categories.reverse(); await window.refreshCategories(); });
  await dialog.getByLabel("Nama kategori 1", { exact: true }).fill("Alat Tulis Baru");
  await dialog.getByRole("button", { name: "Simpan Kategori", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(await page.evaluate(() => window.actions.filter(action => action.action === "update").at(-1).categories), [{ id: "old", name: "Alat Tulis Baru" }]);
  assert.equal(await page.evaluate(() => window.categories.find(c => c.id === "old").color), "#ff0000");

  // A category removed remotely must keep its original submitted ID and show a conflict.
  await page.getByLabel("Pilih Lama Dua", { exact: true }).check();
  await page.getByRole("button", { name: "Ubah Pilihan", exact: true }).click();
  dialog = page.getByRole("dialog");
  await page.evaluate(async () => { window.categories = window.categories.filter(c => c.id !== "other"); await window.refreshCategories(); });
  await dialog.getByLabel("Nama kategori 1", { exact: true }).fill("Lama Dua Revisi");
  await dialog.getByRole("button", { name: "Simpan Kategori", exact: true }).click();
  await dialog.getByRole("alert").waitFor();
  assert.deepEqual(await page.evaluate(() => window.actions.filter(action => action.action === "update").at(-1).categories), [{ id: "other", name: "Lama Dua Revisi" }]);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.evaluate(async () => { window.categories.find(c => c.id === "old").name = "Alat Tulis"; window.categories.push({ id: "other", name: "Lama Dua", icon: "package", color: null, order: 0, salesGroup: "OTHER", _count: { products: 1 } }); await window.refreshCategories(); });
  await page.getByRole("button", { name: "Bersihkan Pilihan", exact: true }).click();

  // Bulk source-to-target mapping, review, stale-data rejection, and fresh confirmation.
  await page.getByLabel("Pilih Alat Tulis", { exact: true }).check();
  await page.getByLabel("Pilih Lama Dua", { exact: true }).check();
  await page.getByRole("button", { name: "Hapus Pilihan", exact: true }).click();
  dialog = page.getByRole("dialog");
  assert.equal(await dialog.evaluate(element => element.matches(":modal")), true);
  await dialog.getByLabel("Tujuan untuk Alat Tulis").selectOption("target");
  await dialog.getByLabel("Tujuan untuk Lama Dua").selectOption("target");
  await dialog.getByRole("button", { name: "Tinjau Dampak Seluruh Toko" }).click();
  await dialog.getByText("Perhatian: perubahan ini memengaruhi produk dan harga pelanggan", { exact: true }).waitFor();
  assert.match(await dialog.innerText(), /3 produk/);
  assert.match(await dialog.innerText(), /Toko Cabang/);
  assert.match(await dialog.innerText(), /Joyko/);
  const confirm = dialog.getByRole("button", { name: "Pindahkan Produk dan Hapus Kategori", exact: true });
  assert.equal(await confirm.isEnabled(), false);
  await dialog.getByLabel("Saya memahami dampak pemindahan produk dan penghapusan aturan harga ini").check();
  await dialog.getByLabel("Ketik HAPUS 2 KATEGORI").fill("HAPUS 2 KATEGORI");
  assert.equal(await confirm.isEnabled(), true);

  // Changing one destination revokes both the reviewed impact and typed consent.
  await dialog.getByLabel("Tujuan untuk Alat Tulis").selectOption("new0");
  assert.equal(await dialog.getByLabel("Ketik HAPUS 2 KATEGORI").count(), 0);
  assert.equal(await dialog.getByRole("button", { name: "Hapus Kategori", exact: true }).isEnabled(), false);
  await dialog.getByLabel("Tujuan untuk Alat Tulis").selectOption("target");
  await dialog.getByRole("button", { name: "Tinjau Dampak Seluruh Toko" }).click();
  const deleteConsent = dialog.getByLabel("Saya memahami dampak pemindahan produk dan penghapusan aturan harga ini");
  await deleteConsent.waitFor();
  assert.equal(await deleteConsent.isChecked(), false);
  assert.equal(await dialog.getByLabel("Ketik HAPUS 2 KATEGORI").inputValue(), "");
  await deleteConsent.check();
  await dialog.getByLabel("Ketik HAPUS 2 KATEGORI").fill("HAPUS 2 KATEGORI");

  for (const width of [1100, 375]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => !!document.activeElement.closest("dialog")), true);
  }
  if (process.env.CATEGORY_SCREENSHOT) await page.screenshot({ path: process.env.CATEGORY_SCREENSHOT, fullPage: true });
  await page.evaluate(() => { window.staleOnce = true; });
  await confirm.click();
  await dialog.getByRole("alert").waitFor();
  assert.equal(await dialog.getByLabel("Ketik HAPUS 2 KATEGORI").count(), 0);
  assert.equal(await page.evaluate(() => window.deleted), undefined);
  await dialog.getByRole("button", { name: "Tinjau Dampak Seluruh Toko" }).click();
  await dialog.getByLabel("Saya memahami dampak pemindahan produk dan penghapusan aturan harga ini").check();
  await dialog.getByLabel("Ketik HAPUS 2 KATEGORI").fill("HAPUS 2 KATEGORI");
  await dialog.getByRole("button", { name: "Pindahkan Produk dan Hapus Kategori", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual((await page.evaluate(() => window.deleted)).sort(), ["old", "other"]);

  // Transfer sends the original selected IDs, reports already-at-target products, and supports Escape.
  const openMove = page.getByRole("button", { name: "Pindah produk pilihan", exact: true });
  await openMove.click();
  dialog = page.getByRole("dialog");
  assert.equal(await dialog.getByRole("button", { name: "Tinjau Pemindahan", exact: true }).isEnabled(), false);
  await dialog.getByRole("combobox", { name: /^Kategori tujuan/ }).selectOption("target");
  await page.evaluate(() => { window.failNextAction = "preview-move"; });
  await dialog.getByRole("button", { name: "Tinjau Pemindahan", exact: true }).click();
  await dialog.getByRole("alert").filter({ hasText: "Periksa koneksi internet" }).waitFor();
  assert.equal(await dialog.getByRole("combobox", { name: /^Kategori tujuan/ }).inputValue(), "target");
  assert.equal(await dialog.getByRole("button", { name: "Pindahkan Produk", exact: true }).isEnabled(), false);
  assert.equal(await page.evaluate(() => window.actions.filter(action => action.action === "move").length), 0);
  await page.evaluate(() => { window.expireNextPreview = true; });
  await dialog.getByRole("button", { name: "Tinjau Pemindahan", exact: true }).click();
  await dialog.getByRole("alert").filter({ hasText: "Pratinjau kedaluwarsa" }).waitFor();
  const moveConsent = dialog.getByLabel("Saya memahami bahwa harga pelanggan dapat berubah mengikuti kategori tujuan");
  assert.equal(await moveConsent.count(), 0);
  assert.equal(await dialog.getByRole("button", { name: "Pindahkan Produk", exact: true }).isEnabled(), false);
  await dialog.getByRole("button", { name: "Tinjau Pemindahan", exact: true }).click();
  await moveConsent.check();
  assert.equal(await dialog.getByRole("button", { name: "Pindahkan Produk", exact: true }).isEnabled(), true);
  await dialog.getByRole("combobox", { name: /^Kategori tujuan/ }).selectOption("new0");
  assert.equal(await moveConsent.count(), 0);
  assert.equal(await dialog.getByRole("button", { name: "Pindahkan Produk", exact: true }).isEnabled(), false);
  await dialog.getByRole("combobox", { name: /^Kategori tujuan/ }).selectOption("target");
  await dialog.getByRole("button", { name: "Tinjau Pemindahan", exact: true }).click();
  await dialog.getByText(/1 produk sudah di tujuan/).waitFor();
  assert.equal(await moveConsent.isChecked(), false);
  await dialog.getByLabel("Saya memahami bahwa harga pelanggan dapat berubah mengikuti kategori tujuan").check();
  await dialog.getByRole("button", { name: "Pindahkan Produk", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(await page.evaluate(() => window.actions.find(action => action.action === "move").productIds), ["p1", "p2"]);
  await openMove.click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(await openMove.evaluate(element => element === document.activeElement), true);

  // Editing a long list keeps filtered drafts and the change count across searches.
  // The action remains reachable at both viewport sizes after scrolling 27 rows.
  await page.evaluate(async () => {
    window.categories = Array.from({ length: 27 }, (_, index) => ({
      id: `visual-${index}`, name: `Kategori Uji ${String(index + 1).padStart(2, "0")}`,
      icon: "package", color: null, order: index, salesGroup: "OTHER", _count: { products: 0 },
    }));
    await window.refreshCategories();
  });
  await page.getByLabel("Pilih Kategori Uji 01", { exact: true }).waitFor();
  for (const width of [1100, 375]) {
    await page.setViewportSize({ width, height: 850 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.getByLabel("Pilih Kategori Uji 01", { exact: true }).isVisible(), true);
  }
  await page.setViewportSize({ width: 1100, height: 850 });
  await page.getByLabel("Pilih semua kategori yang terlihat", { exact: true }).check();
  await page.getByRole("button", { name: "Ubah Pilihan", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nama kategori 1", { exact: true }).fill("Kategori Pertama Baru");
  await dialog.getByText("1 kategori berubah", { exact: true }).waitFor();
  const editorSearch = dialog.getByPlaceholder("Cari kategori di daftar ini...", { exact: true });
  await editorSearch.fill("Uji 02");
  assert.equal(await dialog.getByLabel("Nama kategori 1", { exact: true }).count(), 0);
  const filteredName = dialog.getByLabel("Nama kategori 2", { exact: true });
  await filteredName.focus();
  await filteredName.press("ControlOrMeta+A");
  await filteredName.pressSequentially("Kategori Kedua Baru", { delay: 10 });
  assert.equal(await filteredName.inputValue(), "Kategori Kedua Baru");
  await dialog.getByText("2 kategori berubah", { exact: true }).waitFor();
  await editorSearch.fill("tidak ada hasil 123");
  assert.equal(await dialog.getByLabel(/^Nama kategori \d+$/).count(), 0);
  await dialog.getByText("2 kategori berubah", { exact: true }).waitFor();
  await editorSearch.fill("");
  assert.equal(await dialog.getByLabel("Nama kategori 1", { exact: true }).inputValue(), "Kategori Pertama Baru");
  assert.equal(await dialog.getByLabel("Nama kategori 2", { exact: true }).inputValue(), "Kategori Kedua Baru");
  for (const width of [1100, 375]) {
    await page.setViewportSize({ width, height: 850 });
    await dialog.getByLabel("Nama kategori 27", { exact: true }).scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    const saveBounds = await dialog.getByRole("button", { name: "Simpan Kategori", exact: true }).boundingBox();
    assert.ok(saveBounds && saveBounds.y >= 0 && saveBounds.y + saveBounds.height <= 850,
      `Simpan Kategori must remain visible after scrolling 27 rows at ${width}px`);
    if (screenshotDir) await page.screenshot({ path: path.join(screenshotDir, `category-editor-${width}.png`) });
  }
  await dialog.getByRole("button", { name: "Simpan Kategori", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.deepEqual(await page.evaluate(() => window.actions.filter(action => action.action === "update").at(-1).categories), [
    { id: "visual-0", name: "Kategori Pertama Baru" },
    { id: "visual-1", name: "Kategori Kedua Baru" },
  ]);
  assert.deepEqual(errors, []);
  process.stdout.write("PASS category UI: visual icon/color choices, bilingual icon search, filtered drafts/change counts, 27-row sticky save, native validation/no-op edits, failed request recovery, pending save protection, destination/expiry consent reset, batch create/edit, partial-patch row errors, stable editor IDs after refetch/removal, affected counts/stores/rules, stale confirmation reset, bulk deletion, selected product move, desktop/mobile overflow, native focus/Escape\n");
} finally {
  await browser.close();
}
