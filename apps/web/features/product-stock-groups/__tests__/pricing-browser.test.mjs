import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { bundleReactHarness, repo } from "./browser-harness.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const review = { price: [], costPrice: [] };
const variants = [
  { id: "pcs", name: "Snowman", sku: "SN-PCS", unit: "pcs", price: 3000, costPrice: 2000, stock: 120, unitMultiplierToBase: 1, conversionNeedsReview: false },
  { id: "pak", name: "Snowman", sku: "SN-PAK", unit: "pak", price: 32400, costPrice: 21000, stock: 10, unitMultiplierToBase: 12, conversionNeedsReview: false },
];
const initial = { id: "snowman", displayName: "Snowman", baseUnit: "pcs", baseStock: 120, hasNegativeStock: false, variants,
  pricingMembers: [...variants.map(v => ({ ...v, isActive: true })), { id: "old", name: "Snowman edisi lama", unit: "dus", isActive: false, unitMultiplierToBase: 24, conversionNeedsReview: false }],
  pricing: { initialized: true, config: { sourceProductId: "pcs", revision: 1, initializationVersion: 1, members: {
    pcs: { mode: "AUTO", factor: { numerator: "1", denominator: "1" }, review },
    pak: { mode: "AUTO", factor: { numerator: "9", denominator: "10" }, review },
    old: { mode: "AUTO", factor: { numerator: "1", denominator: "1" }, review },
  } }, members: [{ productId: "pcs", price: "3000.00", costPrice: "2000.00", review }, { productId: "pak", price: "32400.00", costPrice: "21000.00", review }, { productId: "old", price: "72000.00", costPrice: "48000.00", review }] },
};
const bundle = await bundleReactHarness(`import React from 'react';import {createRoot} from 'react-dom/client';import {GroupPricingPanel} from './features/product-stock-groups/components/GroupPricingPanel';import {projectGroupPricing} from './features/product-stock-groups/automatic-pricing';window.project=projectGroupPricing;window.render=(detail)=>createRoot(document.getElementById('root')).render(<GroupPricingPanel detail={detail} canUpdate onApplied={()=>window.saved++}/>);window.saved=0;`, ["features/product-stock-groups/components/GroupPricingPanel.tsx"]);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const detail = structuredClone(initial);
  let delayed = null, delayNext = false, conflictNext = false, reads = 0;
  const requests = [];
  async function projection(changes) {
    const input = { groupId: "snowman", storeId: "sample", baseUnit: "pcs", config: structuredClone(detail.pricing.config), members: detail.pricing.members.map(m => {
      const meta = detail.pricingMembers.find(v => v.id === m.productId);
      return { ...meta, id: m.productId, groupId: "snowman", storeId: "sample", price: m.price, costPrice: m.costPrice };
    }) };
    if (changes.sourceProductId) input.config.sourceProductId = changes.sourceProductId;
    for (const intent of changes.members ?? []) {
      const member = input.members.find(m => m.id === intent.productId);
      if (intent.mode) input.config.members[member.id].mode = intent.mode;
      if (intent.factor) input.config.members[member.id].factor = intent.factor;
      if (intent.price !== undefined) member.price = intent.price;
      if (intent.costPrice !== undefined) member.costPrice = intent.costPrice;
    }
    return page.evaluate(input => window.project(input), input);
  }
  await page.route("http://localhost:3014/**", async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname === "/fixture") return route.fulfill({ contentType: "text/html", body: '<html lang="id"><body style="margin:0"><main id="root" style="padding:16px"></main></body></html>' });
    if (request.method() === "GET") { reads++; return route.fulfill({ json: detail }); }
    const payload = request.postDataJSON(); requests.push({ method: request.method(), ...payload });
    const after = await projection(payload.changes);
    if (request.method() === "POST") {
      const response = { version: "v" + detail.pricing.config.revision, revision: detail.pricing.config.revision, projectionToken: JSON.stringify(after), before: detail.pricing, after };
      if (delayNext) { delayNext = false; delayed = () => route.fulfill({ json: response }); return; }
      return route.fulfill({ json: response });
    }
    if (conflictNext) { conflictNext = false; detail.pricing.config.revision++; return route.fulfill({ status: 409, json: { message: "Data grup berubah" } }); }
    assert.equal(payload.expectedVersion, "v" + detail.pricing.config.revision);
    assert.equal(payload.expectedProjection, JSON.stringify(after));
    detail.pricing = after; detail.pricing.config.revision++;
    return route.fulfill({ json: after });
  });
  await page.goto("http://localhost:3014/fixture"); await page.addStyleTag({ content: bundle.css }); await page.addScriptTag({ content: bundle.script });
  await page.evaluate(detail => window.render(detail), detail);
  const source = page.getByLabel("Harga jual pcs", { exact: true }), preview = page.getByRole("button", { name: "Pratinjau harga", exact: true }), apply = page.getByRole("button", { name: "Terapkan harga grup", exact: true });
  await source.waitFor(); assert.equal(await apply.isDisabled(), true);
  await page.getByLabel("Sumber harga", { exact: true }).selectOption("pak");
  assert.equal(await page.getByLabel("Harga jual pak", { exact: true }).inputValue(), "32400.00", "replacement source binds its own persisted selling price");
  assert.equal(await page.getByLabel("HPP (opsional) pak", { exact: true }).inputValue(), "21000.00");
  await page.getByText("1 pcs = 1 / 12 pak", { exact: true }).waitFor();
  await page.getByLabel("Sumber harga", { exact: true }).selectOption("pcs");
  assert.equal(await page.getByLabel("HPP otomatis pak", { exact: true }).evaluate(element => element.tagName), "OUTPUT");
  assert.match(await page.getByLabel("HPP otomatis pak", { exact: true }).innerText(), /21\.000/, "GET keeps persisted legacy HPP before preview");
  await page.getByRole("region", { name: "Harga tersimpan", exact: true }).waitFor();
  await page.getByText("1 pak = 12 pcs", { exact: true }).waitFor();
  await source.fill("3500"); await source.focus(); await page.keyboard.press("Tab");
  assert.match(await page.getByRole("region", { name: "Harga tersimpan", exact: true }).innerText(), /Belum dihitung/);
  assert.match(await page.getByLabel("Harga otomatis pak", { exact: true }).innerText(), /32\.400/, "editing source must not imply a fresh follower projection");
  assert.equal(await page.getByLabel("HPP (opsional) pcs", { exact: true }).evaluate(e => document.activeElement === e), true, "native keyboard order");
  await preview.click(); await page.getByRole("region", { name: "Pratinjau perubahan harga" }).waitFor();
  assert.match(await page.getByLabel("Harga otomatis pak", { exact: true }).innerText(), /37\.800/);
  assert.match(await page.getByLabel("HPP otomatis pak", { exact: true }).innerText(), /24\.000/);
  assert.deepEqual(requests[0].changes, { members: [{ productId: "pcs", price: "3500" }] });
  assert.match(await page.getByRole("region", { name: "Pratinjau perubahan harga" }).innerText(), /Snowman edisi lama/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "mobile375 no horizontal overflow");
  await mkdir(path.join(repo, "apps/web/public/images/changelog"), { recursive: true });
  await page.getByRole("region", { name: "Pratinjau perubahan harga" }).screenshot({ path: path.join(repo, "apps/web/public/images/changelog/harga-otomatis-snowman-2026-10-24.png") });
  await page.locator("#root").screenshot({ path: path.join(repo, "output/harga-otomatis-grup-mobile375.png") });
  for (const button of [preview, apply]) {
    await button.focus();
    await page.keyboard.press("Shift+Tab"); await page.keyboard.press("Tab");
    const bounds = await button.boundingBox();
    assert.ok(bounds.height >= 48 && bounds.y >= 0 && bounds.y + bounds.height <= 812, "focused actions remain reachable on mobile375");
    assert.notEqual(await button.evaluate(element => getComputedStyle(element).outlineStyle), "none", "keyboard focus is visible");
  }
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  const sourceBounds = await page.getByRole("group", { name: "Sumber harga grup", exact: true }).boundingBox();
  const ledgerBounds = await page.getByRole("region", { name: "Pratinjau perubahan harga" }).boundingBox();
  assert.ok(ledgerBounds.x > sourceBounds.x + sourceBounds.width, "desktop ledger sits beside the source editor");
  const sourceContrast = await page.getByRole("group", { name: "Sumber harga grup", exact: true }).evaluate(element => {
    const luminance = color => color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => {
      const channel = value / 255; return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    }).reduce((total, value, index) => total + value * [.2126, .7152, .0722][index], 0);
    const background = luminance(getComputedStyle(element).backgroundColor);
    return [...element.querySelectorAll('label > span:first-child')].map(label => {
      const foreground = luminance(getComputedStyle(label).color);
      return (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05);
    });
  });
  assert.ok(sourceContrast.length === 3 && sourceContrast.every(value => value >= 4.5), "source labels meet AA against actual ink background");
  process.stdout.write(`PASS source label contrast minimum ${Math.min(...sourceContrast).toFixed(2)}:1\n`);
  await page.locator("#root").screenshot({ path: path.join(repo, "apps/web/public/images/changelog/harga-otomatis-grup-panel-2026-10-24.png") });
  await page.setViewportSize({ width: 375, height: 812 });
  await source.fill("3600"); assert.equal(await apply.isDisabled(), true, "editing invalidates preview");
  delayNext = true; await preview.click(); await page.getByRole("button", { name: "Menghitung pratinjau…" }).waitFor();
  await source.fill("3700"); while (!delayed) await new Promise(resolve => setTimeout(resolve, 10)); await delayed();
  await preview.waitFor(); assert.equal(await apply.isDisabled(), true, "late preview cannot enable apply for changed draft");
  assert.equal(await page.getByRole("region", { name: "Pratinjau perubahan harga" }).count(), 0);
  await page.getByLabel("Mode harga pak", { exact: true }).selectOption("MANUAL");
  await page.getByLabel("Harga jual pak", { exact: true }).fill("40000");
  await page.getByLabel("HPP (opsional) pak", { exact: true }).fill("25000");
  await preview.click(); await apply.waitFor({ state: "visible" });
  await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Terapkan harga grup').disabled);
  conflictNext = true; await apply.click();
  await page.getByText("Data grup berubah. Input Anda tetap tersimpan; buat pratinjau baru.").waitFor();
  assert.equal(await source.inputValue(), "3700"); assert.equal(await page.getByLabel("Harga jual pak", { exact: true }).inputValue(), "40000");
  assert.equal(await apply.isDisabled(), true); assert.equal(reads, 1);
  await page.waitForFunction(() => document.activeElement?.closest('label')?.textContent.includes('HPP (opsional) pak'));
  await source.focus(); await preview.click(); await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(b => b.textContent === 'Terapkan harga grup').disabled);
  await apply.click(); await page.getByText("Harga grup berhasil diterapkan.").waitFor();
  assert.equal(await page.evaluate(() => window.saved), 1); assert.equal(reads, 2);
  assert.deepEqual(errors, []);
  process.stdout.write("PASS Snowman source3500/pack37800/HPP24000; inactive labels; Manual; stale refresh; delayed preview; keyboard; mobile375; actual screenshot" + "\n");
  await page.close();
  // Invalid stored source is a labelled repair, never a silent replacement.
  const repair = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await repair.route("http://localhost:3014/**", route => route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' }));
  await repair.goto("http://localhost:3014/fixture"); await repair.addStyleTag({ content: bundle.css }); await repair.addScriptTag({ content: bundle.script });
  const unavailable = structuredClone(initial); unavailable.pricing.config.sourceProductId = "old";
  await repair.evaluate(detail => window.render(detail), unavailable);
  await repair.getByText("Pilih sumber aktif dengan konversi yang valid untuk memperbaiki harga otomatis.").waitFor();
  await repair.getByLabel("Sumber harga", { exact: true }).selectOption("pcs");
  assert.equal(await repair.getByRole("button", { name: "Pratinjau harga" }).isEnabled(), true);
  await repair.close(); process.stdout.write("PASS labelled unavailable source repair" + "\n");

  const edge = await browser.newPage({ viewport: { width: 375, height: 812 } });
  await edge.route("http://localhost:3014/**", route => route.fulfill({ contentType: "text/html", body: '<html lang="id"><body style="margin:0"><main id="root" style="padding:16px"></main></body></html>' }));
  await edge.goto("http://localhost:3014/fixture"); await edge.addStyleTag({ content: bundle.css }); await edge.addScriptTag({ content: bundle.script });
  const edgeDetail = structuredClone(initial);
  edgeDetail.pricing.members[0].price = "0.28"; edgeDetail.pricing.members[0].costPrice = null;
  edgeDetail.pricing.members[1].price = "3.33"; edgeDetail.pricing.members[1].costPrice = "4.22";
  edgeDetail.pricing.config.members.pak.factor = { numerator: "4", denominator: "7" };
  edgeDetail.pricingMembers[1].name = "Snowman spidol papan tulis seri kemasan panjang untuk kebutuhan toko dan sekolah";
  for (let index = 0; index < 8; index++) {
    const id = "extra" + index;
    edgeDetail.pricingMembers.push({ id, name: "Snowman kemasan tambahan " + index, unit: "pak " + index, unitMultiplierToBase: 36 + index, isActive: false, conversionNeedsReview: false });
    edgeDetail.pricing.config.members[id] = { mode: "AUTO", factor: { numerator: "1", denominator: "1" }, review };
    edgeDetail.pricing.members.push({ productId: id, price: "0.00", costPrice: index === 0 ? null : "0.00", review: index === 0 ? { price: [], costPrice: ["SOURCE_COST_UNKNOWN"] } : review });
  }
  await edge.evaluate(detail => window.render(detail), edgeDetail);
  await edge.getByLabel("Harga jual pcs", { exact: true }).waitFor();
  assert.match(await edge.getByLabel("Harga otomatis pak", { exact: true }).innerText(), /3,33/);
  assert.match(await edge.getByRole("region", { name: "Harga tersimpan", exact: true }).innerText(), /0,28/);
  assert.match(await edge.getByRole("region", { name: "Harga tersimpan", exact: true }).innerText(), /Belum diketahui/);
  await edge.getByText("Margin negatif: HPP lebih tinggi dari harga jual.", { exact: true }).waitFor();
  await edge.getByText("Rumus & faktor eksak", { exact: true }).focus(); await edge.keyboard.press("Enter");
  await edge.getByText("4/7", { exact: true }).waitFor();
  assert.equal(await edge.getByLabel("Persentase pak", { exact: true }).inputValue(), "42.857143");
  assert.equal(await edge.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "long names, many units and exact factor fit mobile375");
  await edge.getByRole("button", { name: "Pratinjau harga", exact: true }).focus();
  const edgeAction = await edge.getByRole("button", { name: "Pratinjau harga", exact: true }).boundingBox();
  assert.ok(edgeAction.y >= 0 && edgeAction.y + edgeAction.height <= 812, "actions remain reachable with many units");
  await edge.close();
  process.stdout.write("PASS fractional money, unknown/zero HPP, negative margin, exact 4/7, long names and many units at375\n");
} finally { await browser.close(); }
