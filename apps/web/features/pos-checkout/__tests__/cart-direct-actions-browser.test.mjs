import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs/promises";
import { web, repo, bundleReactHarness } from "../../product-stock-groups/__tests__/browser-harness.mjs";

const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("vitest")] }));
const { chromium } = require("@playwright/test");
const fixture = `
  import React, {useState} from 'react';
  import {createRoot} from 'react-dom/client';
  import {CartSidebar} from './components/CartSidebar';
  const product = {cartLineId:'PRODUCT:sample',lineType:'PRODUCT',productId:'sample',name:'Alas Mouse Pad',price:13500,catalogPrice:13500,hargaAgen:null,hargaDinas:15000,quantity:1,unit:'Bh',stock:10};
  function App() {
    const [items,setItems] = useState([product]);
    const [allowed,setAllowed] = useState(true);
    const [message,setMessage] = useState('');
    window.setCartPermission = setAllowed;
    window.setCartItems = setItems;
    return <><div style={{width:'100%',maxWidth:340,height:720,position:'relative',zIndex:200}} data-testid="cart"><CartSidebar items={items} subtotal={items.reduce((sum,item)=>sum+item.price*item.quantity,0)} totalItems={items.reduce((sum,item)=>sum+item.quantity,0)} canQuickEdit={allowed} onEditProduct={item=>setMessage('Edit '+item.productId)} onEditPrice={item=>setMessage('Harga '+item.productId)} onUpdateQuantity={(id,quantity)=>setItems(current=>current.map(item=>item.cartLineId===id?{...item,quantity}:item))} onRemoveItem={id=>setItems(current=>current.filter(item=>item.cartLineId!==id))} onClearCart={()=>setItems([])} onCheckout={()=>setMessage('Bayar')} /></div><output>{message}</output><output data-testid="committed-quantity">{items[0]?.quantity}</output></>;
  }
  createRoot(document.getElementById('root')).render(<App/>);
`;
const bundle = await build({
  stdin: { contents: fixture, resolveDir: web, loader: "tsx" },
  outdir: path.join(repo, "output/cart-harness"), bundle: true, write: false,
  platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
});
const { css } = await bundleReactHarness("", ["components/CartSidebar.tsx", "features/pos-checkout/components/CartQuantityInput.tsx", "features/pos-checkout/components/CartStockWarningDialog.tsx", "../../packages/ui/src/Button.tsx"]);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const screenshots = path.join(repo, "output/playwright/cart-direct-actions");
await fs.mkdir(screenshots, { recursive: true });
try {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: { width: touch ? 360 : 1100, height: 900 }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.setContent('<html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div></body></html>');
    await page.addStyleTag({ content: css + bundle.outputFiles.filter(file => file.path.endsWith(".css")).map(file => file.text).join("\n") });
    await page.addScriptTag({ content: bundle.outputFiles.find(file => file.path.endsWith(".js")).text });
    const edit = page.getByRole("button", { name: "Ubah produk Alas Mouse Pad", exact: true });
    const price = page.getByRole("button", { name: "Ubah harga produk Alas Mouse Pad", exact: true });
    await page.getByText("Keranjang", { exact: true }).waitFor();
    assert.equal(await edit.isVisible(), true, "Edit is available without enabling a mode");
    assert.equal(await price.isVisible(), true, "Harga is available without enabling a mode");
    assert.equal(await page.getByRole("button", { name: /aktifkan Edit Cepat/i }).count(), 0);
    await edit.click();
    await page.getByText("Edit sample", { exact: true }).waitFor();
    await price.focus();
    await page.keyboard.press("Enter");
    await page.getByText("Harga sample", { exact: true }).waitFor();
    assert.equal(await price.evaluate(el => el.matches(":focus-visible")), true, "keyboard focus remains visible");
    const editBox = await edit.boundingBox();
    const quantityBox = await page.getByRole("textbox", { name: "Jumlah Alas Mouse Pad", exact: true }).boundingBox();
    assert.ok(editBox.y >= quantityBox.y - 1 && editBox.y < quantityBox.y + quantityBox.height, "actions share the quantity row");
    if (touch) assert.ok(editBox.height >= 44, "touch actions remain at least 44px tall");
    await page.getByRole("button", { name: "Tambah jumlah Alas Mouse Pad" }).click();
    assert.equal(await page.getByRole("textbox", { name: "Jumlah Alas Mouse Pad", exact: true }).inputValue(), "2");
    await page.getByRole("button", { name: "Kurangi jumlah Alas Mouse Pad" }).click();
    await page.getByRole("textbox", { name: "Jumlah Alas Mouse Pad", exact: true }).fill("3");
    await page.getByRole("textbox", { name: "Jumlah Alas Mouse Pad", exact: true }).press("Enter");
    assert.equal(await page.getByRole("textbox", { name: "Jumlah Alas Mouse Pad", exact: true }).inputValue(), "3");
    await page.evaluate(() => document.activeElement.blur());
    await page.getByTestId("cart").screenshot({ path: path.join(screenshots, touch ? "mobile.png" : "desktop.png") });
    if (!touch) {
      await page.screenshot({
        path: path.join(web, "public/images/changelog/aksi-langsung-keranjang.png"),
        clip: { x: 0, y: 0, width: 340, height: 253 },
      });
    }
    await page.evaluate(() => window.setCartPermission(false));
    await edit.waitFor({ state: "detached" });
    assert.equal(await price.count(), 0, "callbacks alone cannot grant edit access");
    await page.evaluate(() => {
      window.setCartPermission(true);
      window.setCartItems([{cartLineId:'PRINTING_SERVICE:sample',lineType:'PRINTING_SERVICE',name:'Cetak contoh',price:10000,quantity:1,unit:'lembar'}]);
    });
    await page.getByText("Cetak contoh", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: /Ubah (produk|harga produk)/ }).count(), 0, "printing services have no product editor");
    await page.evaluate(() => window.setCartItems([{cartLineId:'PRODUCT:empty',lineType:'PRODUCT',productId:'empty',name:'Produk stok kosong',price:10000,catalogPrice:10000,quantity:1,unit:'Bh',stock:0}]));
    const add = page.getByRole("button", { name: "Tambah jumlah Produk stok kosong", exact: true });
    const input = page.getByRole("textbox", { name: "Jumlah Produk stok kosong", exact: true });
    const dialog = page.getByRole("dialog", { name: "Jumlah melebihi stok", exact: true });
    const committed = page.getByTestId("committed-quantity");
    await add.waitFor();
    assert.equal(await add.isEnabled(), true, "plus remains enabled even when stock is zero");
    await add.click();
    await dialog.waitFor();
    assert.equal(await dialog.evaluate(el => el.matches(":modal")), true, "warning uses the top layer above the mobile cart");
    assert.equal(await dialog.getByRole("button", { name: "Batal", exact: true }).evaluate(el => el === document.activeElement), true, "initial focus stays on cancel");
    assert.equal(await committed.textContent(), "1", "plus waits for confirmation");
    assert.match(await dialog.textContent(), /0 Bh/);
    assert.match(await dialog.textContent(), /2 Bh/);
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(await input.inputValue(), "1", "cancel preserves the old quantity");
    await add.click();
    await dialog.getByRole("button", { name: "Tetap Tambahkan", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert.equal(await input.inputValue(), "2");
    await input.fill("12");
    assert.equal(await dialog.count(), 0, "typing does not open a popup per digit");
    assert.equal(await committed.textContent(), "2", "typing does not commit early");
    await input.press("Enter");
    await dialog.waitFor();
    assert.match(await dialog.textContent(), /12 Bh/);
    assert.equal(await committed.textContent(), "2");
    await dialog.screenshot({ path: path.join(screenshots, touch ? "stock-warning-mobile.png" : "stock-warning-desktop.png") });
    if (!touch) await dialog.screenshot({ path: path.join(web, "public/images/changelog/peringatan-jumlah-keranjang.png") });
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    assert.equal(await input.inputValue(), "2", "Escape cancels a typed increase");
    await input.fill("8");
    await page.getByText("Keranjang", { exact: true }).click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Tetap Tambahkan", exact: true }).click();
    assert.equal(await input.inputValue(), "8", "blur can commit an overstock increase after confirmation");
    await page.getByRole("button", { name: "Kurangi jumlah Produk stok kosong" }).click();
    assert.equal(await input.inputValue(), "7", "decreasing an already overstock quantity needs no warning");
    assert.equal(await dialog.count(), 0);
    await input.fill("6");
    await input.press("Enter");
    assert.equal(await input.inputValue(), "6");
    assert.equal(await dialog.count(), 0);
    await input.fill("9");
    await input.press("Escape");
    assert.equal(await input.inputValue(), "6", "Escape while editing discards the draft");
    assert.equal(await dialog.count(), 0);
    await input.fill("13");
    const payBox = await page.getByRole("button", { name: "Bayar", exact: true }).boundingBox();
    await page.mouse.click(payBox.x + payBox.width / 2, payBox.y + payBox.height / 2);
    await dialog.waitFor();
    assert.match(await dialog.textContent(), /13 Bh/);
    assert.notEqual(await page.locator("output").first().textContent(), "Bayar", "blur onto checkout cannot bypass confirmation");
    assert.equal(await committed.textContent(), "6");
    await page.mouse.click(4, 4);
    await dialog.waitFor({ state: "detached" });
    assert.equal(await input.inputValue(), "6", "backdrop dismisses without changing quantity");
    await page.evaluate(() => window.setCartItems([{cartLineId:'PRODUCT:empty',lineType:'PRODUCT',productId:'empty',name:'Produk stok kosong',price:10000,catalogPrice:10000,quantity:1,unit:'Bh',stock:2}]));
    await add.click();
    assert.equal(await input.inputValue(), "2", "stock equality needs no warning");
    assert.equal(await dialog.count(), 0);
    await add.click();
    await dialog.waitFor();
    await dialog.getByRole("button", { name: "Tetap Tambahkan", exact: true }).click();
    assert.equal(await input.inputValue(), "3", "insufficient positive stock can be exceeded");
    await page.evaluate(() => window.setCartItems([{cartLineId:'PRODUCT:empty',lineType:'PRODUCT',productId:'empty',name:'Produk stok kosong',price:10000,catalogPrice:10000,quantity:1,unit:'Bh',stock:-2}]));
    await add.click();
    await dialog.waitFor();
    assert.match(await dialog.textContent(), /-2 Bh/);
    await page.evaluate(() => window.setCartItems([]));
    await dialog.waitFor({ state: "detached" });
    assert.equal(await committed.textContent(), "", "removed items cannot be confirmed from a stale popup");
    await page.evaluate(() => window.setCartItems([{cartLineId:'PRODUCT:long',lineType:'PRODUCT',productId:'long',name:'Produk contoh dengan nama yang sangat panjang untuk menguji ruang kartu keranjang',price:999999999,catalogPrice:999999999,hargaAgen:999999998,hargaDinas:null,quantity:1,unit:'Bh',stock:10,transactionPrice:999999999}]));
    await page.getByText("Harga khusus", { exact: true }).waitFor();
    for (const width of [320, 360, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "no horizontal overflow at " + width);
    }
    await page.getByRole("button", { name: /Hapus Produk contoh/ }).click();
    await page.getByText("Keranjang kosong", { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    await context.close();
  }
  process.stdout.write("PASS: direct actions, permissions, overstock confirmation via plus/Enter/blur, cancel/Escape, stock boundaries, stale items, and responsive layout\n");
} finally {
  await browser.close();
}
