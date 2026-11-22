import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";

const repo = process.cwd();
const web = path.join(repo, "apps/web");
const require = createRequire(path.join(web, "package.json"));
const { build } = require(require.resolve("esbuild", { paths: [path.join(repo, "node_modules/.pnpm/node_modules")] }));
const { chromium, expect } = require("@playwright/test");
const bundle = await build({
  stdin: { resolveDir: web, loader: "tsx", contents: `
    import React from "react"; import {createRoot} from "react-dom/client";
    import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
    import {ReceiptHistoryClient} from "./features/transaction-history/components/ReceiptHistoryClient";
    import {parseReceiptHistoryParams} from "./features/transaction-history/helpers/receipt-history";
    const queryClient = new QueryClient({defaultOptions:{queries:{retry:false}}});
    function App() { const [version,setVersion]=React.useState(0);
      React.useEffect(()=>{const rerender=()=>setVersion(v=>v+1);addEventListener("popstate",rerender);return ()=>removeEventListener("popstate",rerender)},[]);
      const context=parseReceiptHistoryParams(Object.fromEntries(new URLSearchParams(location.search)));
      return context.status==="valid"?<ReceiptHistoryClient key={version} context={context}/>:null; }
    createRoot(document.getElementById("root")).render(<QueryClientProvider client={queryClient}><App/></QueryClientProvider>);` },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "browser-boundaries", setup(build) {
    build.onResolve({ filter: /providers\/RoleProvider$/ }, () => ({ path: "role", namespace: "fixture" }));
    build.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
    build.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "navigation", namespace: "fixture" }));
    build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path: name }) => ({
      resolveDir: web,
      contents: name === "role" ? 'export function useRole(){return {userId:"sales",storeId:"example",authorizationFingerprint:"v1"}}'
        : name === "link" ? 'import React from "react";export default function Link({href,children,...props}){return React.createElement("a",{href,...props},children)}'
          : 'export function useRouter(){return {push(url){history.pushState(null,"",url);dispatchEvent(new PopStateEvent("popstate"))}}}',
    }));
  } }],
});
const sources = await Promise.all(["features/transaction-history/components/ReceiptHistoryClient.tsx"].map(file => readFile(path.join(web, file), "utf8")));
const theme = require("tailwindcss/loadConfig")(path.join(repo, "packages/config/tailwind.config.ts"));
const css = await require("postcss")([require("tailwindcss")({ ...theme, content: sources.map(raw => ({ raw, extension: "tsx" })) })]).process("@tailwind base; @tailwind utilities;", { from: undefined });
const html = `<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.css}body{font-family:system-ui,sans-serif}</style><div id="root"></div></html>`;
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const width of [1280, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [];
    const requests = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.clock.install({ time: new Date("2026-11-11T03:00:00Z") });
    await page.route("http://receipt-history.test/**", route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/history/receipts") {
        requests.push(Object.fromEntries(url.searchParams));
        return route.fulfill({ json: { items: [{ transactionId: "old", invoiceNumber: "INV-OLD", date: "2026-11-10", amount: 60000, methods: ["TRANSFER"] }], manualDetailsAvailable: false } });
      }
      return route.fulfill({ contentType: "text/html", body: html });
    });
    await page.goto("http://receipt-history.test/history?mode=receipt&date=2026-11-10&category=ATK&subcategory=Alat+Tulis");
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await expect(page.getByRole("heading", { name: "Riwayat penerimaan" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Harian" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Tanggal pilihan")).toHaveValue("2026-11-10");
    await expect(page.getByRole("link", { name: "INV-OLD" })).toHaveAttribute("href", "/history?search=INV-OLD");
    await expect(page.getByText(/sebagian rincian pemasukan/)).toBeVisible();
    assert.deepEqual([requests.at(-1).dateFrom, requests.at(-1).dateTo], ["2026-11-10", "2026-11-10"]);
    await page.getByRole("button", { name: "Mingguan" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Mingguan" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => requests.at(-1).dateFrom).toBe("2026-11-04");
    assert.equal(new URL(page.url()).searchParams.get("period"), "weekly");
    await page.getByRole("button", { name: "Bulanan" }).click();
    await expect.poll(() => requests.at(-1).dateFrom).toBe("2026-11-01");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    process.stdout.write(`PASS ${width}px: historical receipt date, filters, invoice link, access notice, keyboard and overflow\n`);
    await page.close();
  }
} finally { await browser.close(); }
