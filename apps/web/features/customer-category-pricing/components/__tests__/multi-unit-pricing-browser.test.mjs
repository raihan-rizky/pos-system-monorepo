// Run with Node. The real form saves only to an in-memory fixture.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const repo = path.resolve(web, "../..");
const require = createRequire(path.join(web, "package.json"));
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");

const bundle = await build({
  stdin: {
    contents: [
      "import React from 'react';",
      "import { createRoot } from 'react-dom/client';",
      "import { PricingRuleForm } from './features/customer-category-pricing/components/PricingRuleForm';",
      "const root = createRoot(document.getElementById('root'));",
      "window.renderPricing = initialRule => {",
      "  window.saved = undefined;",
      "  root.render(<PricingRuleForm key={Math.random()} initialRule={initialRule} onSave={async input => { window.saved = input; }} onClose={() => {}} isSaving={false} />);",
      "};",
      "window.renderPricing({ categoryId: 'paper', customerType: 'ALL', unit: 'rim', mode: 'FLAT_DISCOUNT', value: 500, isActive: true });",
    ].join("\n"),
    resolveDir: web, loader: "tsx", sourcefile: "multi-unit-harness.tsx",
  },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "in-memory-pricing-fixtures",
    setup(builder) {
      builder.onResolve({ filter: /^@\/hooks\/(useProducts|useBrands|useCustomerCategoryPricingRules)$/ }, args => ({ path: args.path, namespace: "fixture" }));
      builder.onResolve({ filter: /^\.\/PricingImpactPreview$/ }, () => ({ path: "preview", namespace: "fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
        contents: args.path === "preview" ? "export const PricingImpactPreview=()=>null;" : [
          "export const useCategories=()=>({data:[{id:'paper',name:'Kertas'}]});",
          "export const useBrands=()=>({data:[]});",
          "export const useCreateBrand=()=>({isPending:false});",
          "export const useCustomerCategoryPricingRules=()=>({data:[]});",
          "export const usePricingUnitOptions=()=>({data:['pcs','rim','box'],isPending:false,isError:false});",
          "export const usePricingScopeOptions=()=>({data:{products:[]},isPending:false,isError:false});",
        ].join("\n"),
        loader: "js",
      }));
    },
  }],
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("http://localhost:3004/__multi-unit-fixture", route =>
    route.fulfill({ contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>' }));
  await page.goto("http://localhost:3004/__multi-unit-fixture");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });

  const rim = page.getByRole("checkbox", { name: "rim", exact: true });
  const box = page.getByRole("checkbox", { name: "box", exact: true });
  const pcs = page.getByRole("checkbox", { name: "pcs", exact: true });
  const all = page.getByRole("checkbox", { name: "Semua satuan", exact: true });
  const save = page.getByRole("button", { name: "Simpan aturan", exact: true });

  assert.equal(await rim.isChecked(), true);
  await box.focus();
  await box.press("Space");
  assert.equal(await box.isChecked(), true);
  await save.click();
  await page.waitForFunction(() => window.saved?.units?.length === 2);
  assert.deepEqual(await page.evaluate(() => window.saved.units), ["rim", "box"]);
  assert.equal(await page.evaluate(() => window.saved.unit), null);

  await all.check();
  assert.equal(await rim.isChecked(), false);
  assert.equal(await box.isChecked(), false);
  await save.click();
  await page.waitForFunction(() => window.saved?.units?.length === 0);
  assert.equal(await page.evaluate(() => window.saved.unit), null);

  await pcs.check();
  await save.click();
  await page.waitForFunction(() => window.saved?.units?.length === 1);
  assert.deepEqual(await page.evaluate(() => window.saved.units), ["pcs"]);
  assert.equal(await page.evaluate(() => window.saved.unit), "pcs");
  assert.deepEqual(errors, []);
  console.log("Multi-unit pricing selection: passed");
} finally {
  await browser.close();
}
