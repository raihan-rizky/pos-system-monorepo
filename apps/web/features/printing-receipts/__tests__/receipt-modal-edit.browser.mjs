import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const web = path.join(root, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const esbuild = require(require.resolve("esbuild", { paths: [path.join(root, "node_modules/.pnpm/node_modules")] }));
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const loadConfig = require("tailwindcss/loadConfig");

const bundle = await esbuild.build({
  stdin: {
    contents: `import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
      import { RoleProvider } from '@/components/providers/RoleProvider';
      import { normalizeRolePermissions } from '@/features/rbac/helpers/rbac-core';
      import { PrintingReceiptTransactionModal } from './features/printing-receipts/components/PrintingReceiptTransactionModal';
      import { PrintingReceiptWorkspace } from './features/printing-receipts/components/PrintingReceiptWorkspace';
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const invalidate = client.invalidateQueries.bind(client);
      window.invalidated = [];
      client.invalidateQueries = (filter, ...rest) => { window.invalidated.push(filter.queryKey); return invalidate(filter, ...rest); };
      function App() {
        const [access, setAccess] = useState({ role: 'OWNER', allowed: false });
        const [open, setOpen] = useState(true);
        window.setAccess = setAccess; window.setOpen = setOpen;
        const permissions = normalizeRolePermissions(access.allowed ? [{ role: 'ADMIN', scope: 'resource', target: 'printing_receipt.processed', action: 'update', allowed: true }] : []);
        const transaction = { id: 'transaction-example', printingReceipt: { id: 'receipt-example' }, status: 'DP', total: 75000, amountPaid: 25000 };
        return <QueryClientProvider client={client}><RoleProvider role={access.role} userId="user-example" userName="Contoh" storeId="store-example" permissions={permissions}>
          {location.search === '?workspace' ? <PrintingReceiptWorkspace /> :
            <PrintingReceiptTransactionModal open={open} onClose={() => { window.closedCount += 1; setOpen(false); }} transaction={transaction} />}
        </RoleProvider></QueryClientProvider>;
      }
      window.closedCount = 0;
      createRoot(document.getElementById('root')).render(<App />);`,
    resolveDir: web,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  jsx: "automatic",
  outdir: "bundle",
  platform: "browser",
  format: "iife",
  tsconfig: path.join(web, "tsconfig.json"),
  plugins: [{
    name: "external-ui-boundaries",
    setup(build) {
      const fixtures = {
        "@/components/PaymentModal": "export const PaymentModal = () => null;",
        "@/hooks/useProducts": "export const useProductsPage = () => ({ data: { data: [], pagination: { totalPages: 1 } }, isLoading: false });",
      };
      build.onResolve({ filter: /^@\// }, args => fixtures[args.path] ? { path: args.path, namespace: "fixture" } : undefined);
      build.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: fixtures[args.path], loader: "tsx", resolveDir: web }));
    },
  }],
});

const components = path.join(web, "features/printing-receipts/components");
const source = (await Promise.all((await readdir(components)).filter(file => file.endsWith(".tsx"))
  .map(file => readFile(path.join(components, file), "utf8")))).join("\n");
const config = loadConfig(path.join(web, "tailwind.config.ts"));
const css = await postcss([tailwind({ ...config, content: [{ raw: source, extension: "tsx" }, path.join(root, "packages/ui/src/**/*.{ts,tsx}")] })])
  .process("@tailwind base;@tailwind components;@tailwind utilities;", { from: undefined });
const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><style>html,body{margin:0}${css.css}\n${bundle.outputFiles.find(file => file.path.endsWith(".css"))?.text ?? ""}</style></head><body><div id="root"></div><script>${bundle.outputFiles.find(file => file.path.endsWith(".js")).text}</script></body></html>`;
const initial = {
  id: "receipt-example", storeId: "store-example", subcategory: "SPANDUK", number: "NT-CONTOH", revision: 1,
  transactionId: "transaction-example", createdAt: "2026-10-29T03:00:00Z", updatedAt: "2026-10-29T03:00:00Z",
  transaction: { id: "transaction-example", subtotal: 75000, discount: 0, tax: 0, total: 75000, amountPaid: 25000, change: 0, status: "DP" },
  document: { title: "Nota contoh", customerName: "Pelanggan Contoh", customerPhone: "", customerId: null,
    date: "2026-10-29", note: "", completionDate: "", completionTime: "", receiver: "", setter: "", signatory: "",
    lines: [{ id: "line-example", name: "Spanduk contoh", material: "Flexi", quantity: 1, price: 75000, stockLink: null }] },
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    let receipt = structuredClone(initial);
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", async route => {
      const request = route.request();
      const url = new URL(request.url());
      const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.pathname === "/") return route.fulfill({ contentType: "text/html", body: html });
      if (url.pathname === "/api/printing-receipts") return json({ data: [receipt], pagination: { page: 1, total: 1, totalPages: 1 } });
      if (url.pathname === "/api/printing-receipts/receipt-example") return json(receipt);
      if (url.pathname === "/api/printing-receipts/receipt-example/processed") {
        const body = request.postDataJSON();
        if (request.method() === "POST") {
          const total = body.document.lines.reduce((sum, line) => sum + (line.quantity ?? 0) * (line.price ?? 0), 0);
          return json({ data: { reviewToken: "review-example", before: { subtotal: 75000, total: 75000, paid: 25000, debt: 50000, status: "DP" },
            after: { subtotal: total, total, paid: 25000, debt: total - 25000, status: "DP" }, materials: [] } });
        }
        assert.equal(body.acknowledged, true);
        assert.equal(body.reviewToken, "review-example");
        const total = body.document.lines.reduce((sum, line) => sum + (line.quantity ?? 0) * (line.price ?? 0), 0);
        receipt = { ...receipt, revision: receipt.revision + 1, document: body.document, transaction: { ...receipt.transaction, subtotal: total, total } };
        return json({ data: receipt });
      }
      return route.fulfill({ status: 404, body: "" });
    });

    await page.goto("http://receipt-modal.test");
    await page.getByRole("region", { name: /Pratinjau nota/ }).waitFor();
    assert.deepEqual(errors, []);
    const edit = page.getByRole("button", { name: "Edit nota", exact: true });
    await edit.waitFor({ timeout: 5000 });
    if (width === 1280 && process.argv.includes("--capture")) {
      const previewDialog = page.getByRole("dialog", { name: "Nota SPANDUK · NT-CONTOH" });
      await previewDialog.evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))));
      const preview = await previewDialog.boundingBox();
      const button = await edit.boundingBox();
      assert.ok(preview && button);
      await page.screenshot({ path: path.join(root, "output/edit-nota-pratinjau-2026-10-29.png"), clip: {
        x: Math.floor(preview.x), y: Math.floor(preview.y), width: Math.floor(preview.width),
        height: Math.ceil(button.y + button.height - preview.y + 6),
      } });
    }

    await page.evaluate(() => window.setAccess({ role: "ADMIN", allowed: false }));
    await edit.waitFor({ state: "hidden" });
    await page.evaluate(() => window.setAccess({ role: "ADMIN", allowed: true }));
    await edit.waitFor();
    await page.evaluate(() => window.setAccess({ role: "OWNER", allowed: false }));

    receipt = { ...receipt, transaction: { ...receipt.transaction, status: "CANCELLED" } };
    await edit.click();
    await page.getByRole("alert").filter({ hasText: "Nota ini tidak lagi dapat diedit" }).waitFor();
    assert.equal(await page.getByRole("dialog", { name: "Edit nota diproses" }).count(), 0, "a stale preview must not open an ineligible receipt");
    receipt = structuredClone(initial);
    await edit.click();
    let editor = page.getByRole("dialog", { name: "Edit nota diproses" });
    await editor.waitFor();
    await page.evaluate(() => window.setAccess({ role: "ADMIN", allowed: false }));
    await editor.waitFor({ state: "hidden" });
    await page.getByRole("region", { name: /Pratinjau nota/ }).waitFor();
    assert.equal(await edit.count(), 0, "revoking permission must close the editor and hide the action");
    await page.evaluate(() => window.setAccess({ role: "OWNER", allowed: false }));
    await edit.waitFor();
    assert.equal(await editor.count(), 0, "restoring permission must not reopen an old edit session");

    await edit.click();
    editor = page.getByRole("dialog", { name: "Edit nota diproses" });
    await editor.getByRole("checkbox").check();
    await editor.getByRole("button", { name: "Tetap edit nota" }).click();
    await editor.getByLabel("Harga satuan baris 1", { exact: true }).fill("100000");
    await page.keyboard.press("Escape");
    await editor.getByRole("button", { name: "Buang perubahan" }).click();
    await edit.waitFor();
    assert.equal(await page.evaluate(() => window.closedCount), 0, "Escape from the editor must keep the receipt preview open");
    await page.waitForFunction(() => document.activeElement?.textContent?.includes("Edit nota"));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "the preview must fit the viewport");

    await edit.click();
    editor = page.getByRole("dialog", { name: "Edit nota diproses" });
    await editor.getByRole("checkbox").check();
    await editor.getByRole("button", { name: "Tetap edit nota" }).click();
    await editor.getByLabel("Harga satuan baris 1", { exact: true }).fill("100000");
    await editor.getByRole("button", { name: "Tinjau perubahan" }).click();
    await editor.getByRole("button", { name: "Simpan dan perbarui transaksi" }).click();
    await edit.waitFor();
    assert.equal(receipt.document.lines[0].price, 100000);
    assert.match(await page.getByRole("region", { name: /Pratinjau nota/ }).innerText(), /100\.000/);
    const invalidations = await page.evaluate(() => window.invalidated);
    const keys = invalidations.map(key => key[0]);
    assert.ok(invalidations.some(key => key[0] === "transaction" && key[1] === "transaction-example"), "refresh the edited transaction detail");
    for (const key of ["transaction", "transaction-history", "printing-receipts", "inventory", "customer-receivables", "financial-report"]) {
      assert.ok(keys.includes(key), `missing refresh for ${key}`);
    }

    await page.evaluate(() => window.setOpen(false));
    receipt = { ...receipt, transaction: { ...receipt.transaction, status: "CANCELLED" } };
    await page.evaluate(() => window.setOpen(true));
    await page.getByRole("region", { name: /Pratinjau nota/ }).waitFor();
    assert.equal(await edit.count(), 0, "cancelled receipts must not offer editing");
    await page.evaluate(() => window.setOpen(false));
    receipt = { ...receipt, transaction: { ...receipt.transaction, status: "REFUNDED" } };
    await page.evaluate(() => window.setOpen(true));
    await page.getByRole("region", { name: /Pratinjau nota/ }).waitFor();
    assert.equal(await edit.count(), 0, "refunded receipts must not offer editing");

    receipt = structuredClone(initial);
    await page.goto("http://receipt-modal.test/?workspace");
    if (width < 768) await page.getByRole("button", { name: "Daftar nota", exact: true }).click();
    await page.getByRole("button", { name: /Nota contoh/ }).click();
    await page.getByRole("button", { name: "Cetak / PDF" }).click();
    await edit.click();
    editor = page.getByRole("dialog", { name: "Edit nota diproses" });
    await editor.getByRole("checkbox").check();
    await editor.getByRole("button", { name: "Tetap edit nota" }).click();
    await editor.getByLabel("Harga satuan baris 1", { exact: true }).fill("110000");
    await editor.getByRole("button", { name: "Tinjau perubahan" }).click();
    await editor.getByRole("button", { name: "Simpan dan perbarui transaksi" }).click();
    await edit.waitFor();
    assert.match(await page.getByRole("region", { name: /Pratinjau nota/ }).innerText(), /110\.000/);
    await page.getByRole("button", { name: "Tutup modal" }).click();
    assert.match(await page.locator("main").innerText(), /110\.000/, "the workspace must show the saved correction");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("Receipt preview editing: desktop and mobile passed.");
} finally {
  await browser.close();
}
