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
      import { InboundPricingFields, pricingDraftForUnit, inboundPricingInputFromDraft } from './features/inventory-management/components/InboundPricingFields';
      const units = [
        { productId: 'pcs', unit: 'pcs', unitMultiplierToBase: 1, costPrice: 100, price: 150, hargaAgen: 140, hargaDinas: 130 },
        { productId: 'box', unit: 'box', unitMultiplierToBase: 12, costPrice: 1200, price: 1800, hargaAgen: 1700, hargaDinas: 1600 },
      ];
      function App() {
        const [value, setValue] = useState(pricingDraftForUnit(units[0]));
        const [required, setRequired] = useState(true);
        return <><label><input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} />Sesuai</label>
          <InboundPricingFields units={units} value={value} onChange={setValue} required={required} namePrefix="line" />
          <output data-testid="payload">{JSON.stringify(inboundPricingInputFromDraft(value))}</output></>;
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
  const unit = page.locator('[name="line.productId"]');
  const cost = page.locator('[name="line.costPrice"]');
  const price = page.locator('[name="line.price"]');
  await unit.waitFor();
  assert.equal(await cost.inputValue(), "100");
  assert.equal(await cost.getAttribute("required"), "");
  await cost.fill("125");
  await price.fill("175");
  await unit.selectOption("box");
  assert.equal(await cost.inputValue(), "1200");
  await cost.fill("1500");
  await unit.selectOption("pcs");
  assert.equal(await cost.inputValue(), "125");
  assert.equal(await price.inputValue(), "175");
  await unit.selectOption("box");
  assert.equal(await cost.inputValue(), "1500");
  assert.deepEqual(JSON.parse(await page.getByTestId("payload").innerText()), {
    productId: "box", costPrice: 1500, price: 1800, hargaAgen: 1700, hargaDinas: 1600,
  });
  await page.getByLabel("Sesuai", { exact: true }).uncheck();
  assert.equal(await cost.getAttribute("required"), null);
  await unit.selectOption("");
  assert.equal(await cost.isDisabled(), true);
  assert.deepEqual(JSON.parse(await page.getByTestId("payload").innerText()), {
    productId: null, costPrice: null, price: null, hargaAgen: null, hargaDinas: null,
  });
  console.log("Inbound pricing browser interaction passed.");
} finally {
  await browser.close();
}
