// Run: node apps/web/features/inventory-management/components/__tests__/inbound-receipt-browser.test.mjs
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const web = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const repo = path.resolve(web, "../..");
const { build } = require(
  require.resolve("esbuild", {
    paths: [path.join(repo, "node_modules/.pnpm/node_modules")],
  }),
);
const { chromium } = require("@playwright/test");
const postcss = require("postcss");
const tailwind = require("tailwindcss");
const component =
  "features/inventory-management/components/InboundReceiptTab.tsx";
const bundle = await build({
  stdin: {
    contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { InboundReceiptTab } from './${component}';
    const root = createRoot(document.getElementById('root'));
    window.canManage = true;
    window.created = 0;
    window.renderTab = (props = {}) => root.render(<InboundReceiptTab key={Math.random()} onCreateReceipt={() => window.created++} {...props} />);
    window.renderTab();
  `,
    resolveDir: web,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  jsx: "automatic",
  alias: { "@": web, "@pos/ui": path.join(repo, "packages/ui/src/index.ts") },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "role-fixture",
      setup(builder) {
        builder.onResolve({ filter: /RoleProvider$/ }, () => ({
          path: "role",
          namespace: "fixture",
        }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents:
            "export const useRole = () => ({ canPerform: () => window.canManage });",
        }));
        builder.onLoad({ filter: /\.css$/ }, () => ({
          contents: "",
          loader: "js",
        }));
      },
    },
  ],
});
const source = await readFile(path.join(web, component), "utf8");
const customCss = await readFile(
  path.join(
    web,
    "features/inventory-management/components/inbound-receipt-tab.css",
  ),
  "utf8",
).catch(() => "");
const css = await postcss([
  tailwind({
    content: [
      { raw: source, extension: "tsx" },
      path.join(
        web,
        "features/inventory-management/components/InboundReceiptProductThumbnail.tsx",
      ),
      path.join(repo, "packages/ui/src/**/*.tsx"),
    ],
    theme: {
      extend: {
        colors: {
          surface: require("tailwindcss/colors").slate,
          brand: require("tailwindcss/colors").blue,
        },
      },
    },
  }),
]).process("@tailwind base; @tailwind components; @tailwind utilities;", {
  from: undefined,
});
const line = (id, name, overrides = {}) => ({
  id,
  productId: id,
  goodsPurchaseItemId: id,
  productNameSnapshot: name,
  skuSnapshot: "KRT-A4",
  unitSnapshot: "Rim",
  expectedQuantity: 12,
  receivedQuantity: 10,
  costPriceSnapshot: null,
  supplierCostPrice: null,
  status: "PENDING",
  matchStatus: "NOT_MATCHED",
  reviewStatus: "PENDING",
  note: "Dua rim menyusul pada pengiriman berikutnya.",
  ...overrides,
});
const receipt = (id, supplier, status, lines, extra = {}) => ({
  id,
  supplier: { name: supplier },
  status,
  lines,
  goodsPurchaseId: id,
  goodsPurchaseNumber: `PB-202610-${id}`,
  createdAt: "2026-10-18T18:00:00Z",
  submittedBy: null,
  submittedAt: null,
  approvedAt: null,
  rejectionReason: null,
  revisionReason: null,
  note: null,
  ...extra,
});
const receipts = [
  receipt("001", "Supplier Contoh Kertas", "SUBMITTED", [
    line("paper", "Kertas A4 80 gsm", {
      imageUrl: "/images/kertas_default.png",
    }),
    line("cover", "Sampul Jilid", { matchStatus: null, skuSnapshot: "SMP-01" }),
  ]),
  receipt("002", "Supplier Contoh Tinta", "APPROVED", [
    line("ink", "Tinta Printer", {
      skuSnapshot: "TNT-01",
      receivedQuantity: 12,
      matchStatus: "MATCHED",
      reviewStatus: "APPROVED",
    }),
  ]),
  receipt(
    "003",
    "Supplier Contoh Kemasan",
    "REJECTED",
    [line("box", "Kotak Kemasan", { skuSnapshot: "KMS-01" })],
    { rejectionReason: "Barang rusak saat tiba." },
  ),
];
const artifacts = path.join(repo, "output/playwright/inbound-receipts");
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1150, height: 950 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let fail = false;
  let delay = 0;
  const statusDelay = {};
  const queries = [];
  await page.route("**/images/kertas_default.png", async (route) =>
    route.fulfill({
      contentType: "image/png",
      body: await readFile(path.join(web, "public/images/kertas_default.png")),
    }),
  );
  await page.route("**/images/broken-thumbnail.png", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.route("http://localhost:3002/__inbound-fixture", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: '<html lang="id"><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif"><main style="padding:20px;max-width:1280px;margin:auto"><div id="root"></div></main></body></html>',
    }),
  );
  await page.route(
    "**/api/inventory-management/inbound-receipts?*",
    async (route) => {
      const params = new URL(route.request().url()).searchParams;
      queries.push(Object.fromEntries(params));
      const wait = statusDelay[params.get("status")] ?? delay;
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      await route.fulfill({
        status: fail ? 500 : 200,
        json: {
          data: receipts.filter(
            (row) =>
              !params.has("status") || row.status === params.get("status"),
          ),
        },
      });
    },
  );
  await page.route(
    "**/api/inventory-management/inbound-receipts",
    async (route) => {
      queries.push({});
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({
        status: fail ? 500 : 200,
        json: { data: receipts },
      });
    },
  );
  await page.goto("http://localhost:3002/__inbound-fixture");
  await page.addStyleTag({ content: css.css + customCss });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.getByText("Supplier Contoh Kertas", { exact: true }).waitFor();
  const search = page.getByRole("searchbox", {
    name: "Cari penerimaan barang",
  });
  await search.fill("  krt-a4  ");
  await page
    .getByText("Supplier Contoh Tinta", { exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(
    await page.getByText("Supplier Contoh Kertas", { exact: true }).count(),
    1,
  );
  for (const term of ["Kertas A4", "contoh kertas", "PB-202610-001"]) {
    await search.fill(term);
    assert.equal(
      await page.getByText("Supplier Contoh Kertas", { exact: true }).count(),
      1,
    );
    assert.equal(
      await page.getByText("Supplier Contoh Tinta", { exact: true }).count(),
      0,
    );
  }
  await search.fill("tidak ditemukan");
  await page.getByText("Penerimaan tidak ditemukan", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Hapus pencarian", exact: true })
    .click();
  await page.getByText("Supplier Contoh Tinta", { exact: true }).waitFor();
  delay = 0;
  statusDelay.APPROVED = 400;
  const approvedResponse = page.waitForResponse((response) =>
    response.url().includes("status=APPROVED"),
  );
  const approvedRequest = page.waitForRequest((request) =>
    request.url().includes("status=APPROVED"),
  );
  await page.getByRole("button", { name: "Disetujui", exact: true }).click();
  await approvedRequest;
  await page.getByRole("button", { name: "Diajukan", exact: true }).click();
  await page.getByText("Supplier Contoh Kertas", { exact: true }).waitFor();
  await approvedResponse;
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  assert.equal(
    await page.getByText("Supplier Contoh Tinta", { exact: true }).count(),
    0,
    "late responses must not overwrite the selected status",
  );
  assert.equal(
    await page.getByText("Supplier Contoh Kertas", { exact: true }).count(),
    1,
  );
  await page.getByRole("button", { name: "Semua", exact: true }).click();
  await page.getByText("Supplier Contoh Tinta", { exact: true }).waitFor();
  const detail = page.getByRole("button", {
    name: "Lihat detail PB-202610-001",
    exact: true,
  });
  await detail.focus();
  await page.keyboard.press("Enter");
  assert.equal(
    await page
      .getByRole("button", { name: "Tutup detail PB-202610-001" })
      .getAttribute("aria-expanded"),
    "true",
  );
  const panel = page.getByRole("region", {
    name: "Detail PB-202610-001",
    exact: true,
  });
  await panel.getByText("Dipesan", { exact: true }).first().waitFor();
  await panel.getByText("Diterima", { exact: true }).first().waitFor();
  await panel.getByText("Belum diperiksa", { exact: true }).waitFor();
  const thumbnail = panel.getByRole("img", {
    name: "Foto Kertas A4 80 gsm",
    exact: true,
  });
  await thumbnail.waitFor();
  await thumbnail.evaluate((image) => image.decode());
  assert.equal(
    await thumbnail.evaluate((image) => image.naturalWidth > 0),
    true,
  );
  assert.equal(
    await thumbnail.evaluate(
      (image) => image.getBoundingClientRect().width <= 48,
    ),
    true,
  );
  await panel
    .getByRole("img", { name: "Foto Sampul Jilid belum tersedia", exact: true })
    .waitFor();
  await thumbnail.evaluate((image) => {
    image.src = "/images/broken-thumbnail.png";
  });
  await panel
    .getByRole("img", {
      name: "Foto Kertas A4 80 gsm belum tersedia",
      exact: true,
    })
    .waitFor();
  assert.equal(
    await thumbnail.count(),
    0,
    "broken thumbnails should show a placeholder",
  );
  await page
    .getByRole("button", { name: "Tutup detail PB-202610-001" })
    .click();
  await page
    .getByRole("button", { name: "Lihat detail PB-202610-001" })
    .click();
  await thumbnail.waitFor();
  await thumbnail.evaluate((image) => image.decode());
  await panel
    .getByText(/Dua rim menyusul pada pengiriman berikutnya/)
    .first()
    .waitFor();
  assert.equal(await page.getByText("19 Okt 2026", { exact: true }).count(), 3);
  await page.screenshot({
    path: path.join(artifacts, "desktop.png"),
    fullPage: true,
  });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `overflow at ${width}px`,
    );
    assert.equal(await detail.count(), 0);
    await page
      .getByRole("button", { name: "Catat Penerimaan", exact: true })
      .click();
    if (width === 390)
      await page.screenshot({
        path: path.join(artifacts, "mobile.png"),
        fullPage: true,
      });
  }
  assert.equal(await page.evaluate(() => window.created), 2);
  await page.getByRole("button", { name: "Disetujui", exact: true }).click();
  await page
    .getByText("Supplier Contoh Kertas", { exact: true })
    .waitFor({ state: "hidden" });
  assert.equal(queries.at(-1).status, "APPROVED");
  assert.equal(
    await page
      .getByRole("button", { name: "Disetujui", exact: true })
      .getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page.getByRole("button", { name: "Proses", exact: true }).count(),
    0,
  );
  await page.getByRole("button", { name: "Ditolak", exact: true }).click();
  await page.getByText("Supplier Contoh Kemasan", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Lihat detail PB-202610-003" })
    .click();
  await page.getByText(/Alasan penolakan: Barang rusak saat tiba/).waitFor();
  fail = true;
  await page.getByRole("button", { name: "Diajukan", exact: true }).click();
  await page.getByRole("alert").waitFor();
  fail = false;
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await page.getByText("Supplier Contoh Kertas", { exact: true }).waitFor();
  delay = 250;
  await page.getByRole("button", { name: "Semua", exact: true }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Memuat penerimaan" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Riwayat Penerimaan Barang" })
      .count(),
    1,
  );
  await page.getByText("Supplier Contoh Tinta", { exact: true }).waitFor();
  await page.evaluate(() => {
    window.canManage = false;
    window.renderTab({ goodsPurchaseId: "001", supplierId: "supplier-1" });
  });
  await page.getByText("Supplier Contoh Kertas", { exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Catat Penerimaan", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Proses", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.getByRole("button", { name: "Tolak", exact: true }).count(),
    0,
  );
  assert.deepEqual(queries.at(-1), {
    goodsPurchaseId: "001",
    supplierId: "supplier-1",
  });
  assert.deepEqual(errors, []);
  process.stdout.write(
    "PASS: search, reset, details, WIB dates, keyboard, mobile 390/320px, creation, status filters, rejection, retry, loading, racing filters, scoped requests, permissions.\n",
  );
} finally {
  await browser.close();
}
