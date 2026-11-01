// Run: node apps/web/features/inventory-management/components/__tests__/inbound-pricing-browser.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const repo = path.resolve(web, "../..");
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const bundle = await build({
  stdin: {
    contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { InboundPricingFields, pricingDraftForUnit, inboundPricingInputFromDrafts } from './features/inventory-management/components/InboundPricingFields';
      const units = [
        { productId: 'pcs', unit: 'pcs', unitMultiplierToBase: 1, costPrice: 100, price: 150, hargaAgen: 140, hargaDinas: 130, pricingMode: 'AUTO', pricingSourceProductId: 'pcs' },
        { productId: 'box', unit: 'box', unitMultiplierToBase: 12, costPrice: 1200, price: 1350, hargaAgen: 1700, hargaDinas: null, pricingMode: 'AUTO', pricingSourceProductId: 'pcs', pricingFactor: { numerator: '3', denominator: '4' } },
        { productId: 'old', unit: 'karton', unitMultiplierToBase: 24, costPrice: null, price: 2500, hargaAgen: null, hargaDinas: null, isActive: false },
      ];
      function App() {
        const [value, setValue] = useState(units.map(pricingDraftForUnit));
        const [required, setRequired] = useState(true);
        return <><label><input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} />Sesuai</label>
          <InboundPricingFields units={units} value={value} onChange={setValue} required={required} namePrefix="line" />
          <output data-testid="payload" hidden>{JSON.stringify(inboundPricingInputFromDrafts(units, value))}</output></>;
      }
      createRoot(document.getElementById('root')).render(<App />);
    `,
    resolveDir: web,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  const cost = page.locator('[name="line.pcs.costPrice"]');
  const price = page.locator('[name="line.pcs.price"]');
  const boxCost = page.locator('[name="line.box.costPrice"]');
  const boxPrice = page.locator('[name="line.box.price"]');
  await cost.waitFor();
  assert.equal(await page.locator("select").count(), 0);
  assert.equal(await boxCost.isDisabled(), true);
  assert.equal(await page.locator('[name="line.old.price"]').isDisabled(), true);
  assert.equal(await price.getAttribute("required"), "");
  await cost.focus();
  await page.keyboard.press("Tab");
  assert.equal(await price.evaluate((element) => element === document.activeElement), true);
  await cost.fill("125");
  assert.equal(await boxCost.inputValue(), "1500");
  await price.fill("200");
  assert.equal(await boxPrice.inputValue(), "1800");
  await boxPrice.fill("1900");
  assert.deepEqual(JSON.parse(await page.getByTestId("payload").textContent()), {
    version: 2, units: [
      { productId: "pcs", costPrice: 125, price: 200, hargaAgen: 140, hargaDinas: 130, priceEdited: true },
      { productId: "box", costPrice: 1500, price: 1900, hargaAgen: 1700, hargaDinas: null, priceEdited: true },
    ],
  });
  await page.getByLabel("Sesuai", { exact: true }).uncheck();
  assert.equal(await price.getAttribute("required"), null);
  assert.equal(await page.evaluate(() => innerWidth), 390);
  console.log("Inbound pricing browser interaction passed.");
} finally {
  await browser.close();
}
