import { createRequire } from "node:module";
import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const esbuild = require(require.resolve("esbuild", { paths: [require.resolve("vitest")] }));
const webRoot = process.cwd();
let browser: Browser;
let bundle: string;

beforeAll(async () => {
  const result = await esbuild.build({
    stdin: {
      resolveDir: webRoot,
      loader: "tsx",
      contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
        import { ShoppingRequestList } from "./features/suppliers/shopping-requests/components/ShoppingRequestList";
        createRoot(document.getElementById("root")).render(
          <QueryClientProvider client={new QueryClient()}>
            <ShoppingRequestList onCreateClick={() => {}} onReceive={() => {}} onCompare={() => {}} onViewReceiptHistory={() => {}} />
          </QueryClientProvider>
        );
      `,
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{
      name: "shopping-list-test-boundaries",
      setup(build: any) {
        build.onResolve({ filter: /^@pos\/ui$/ }, () => ({ path: "ui", namespace: "test-stub" }));
        build.onResolve({ filter: /RoleProvider$/ }, () => ({ path: "role", namespace: "test-stub" }));
        build.onResolve({ filter: /useShoppingRequests$/ }, () => ({ path: "hooks", namespace: "test-stub" }));
        build.onResolve({ filter: /(?:ShoppingRequest(?:Print|Approve|Edit|ApprovedQty|FinalApproval|Correction|CorrectionHistory)|GoodsPurchase(?:Create|Approval|Detail|Reject))Modal$/ }, (args: any) => ({
          path: path.basename(args.path), namespace: "test-stub",
        }));
        build.onResolve({ filter: /^@\// }, (args: any) => ({ path: path.join(webRoot, args.path.slice(2)) }));
        build.onLoad({ filter: /.*/, namespace: "test-stub" }, (args: any) => {
          if (args.path === "ui") return { loader: "tsx", resolveDir: webRoot, contents: `
            import React from "react";
            export const Button = ({children, icon, variant, loading, ...props}) => <button {...props}>{children}</button>;
            export const Modal = ({open, onClose, title, children}) => open ? <section role="dialog" aria-label={title}><button type="button" onClick={onClose}>Tutup</button>{children}</section> : null;
          ` };
          if (args.path === "role") return { loader: "tsx", contents: 'export const useRole = () => ({ canPerform: () => true });' };
          if (args.path === "hooks") return { loader: "tsx", contents: `
            export const useShoppingRequests = () => ({ data: { data: window.__rows }, isPending: false, isError: false });
            export const useShoppingRequestSummary = () => ({ isPending: false, isError: true });
            export const useCancelShoppingRequest = () => ({ mutate: () => {}, isPending: false });
          ` };
          return { loader: "tsx", contents: `export const ${args.path} = () => null;` };
        });
      },
    }],
  });
  bundle = result.outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
}, 60_000);

afterAll(async () => { await browser?.close(); }, 60_000);

async function openList(removeRandomUUID: boolean): Promise<Page> {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", error => { console.error("browser error:", error.message); });
  await page.route("http://example.test/**", route => route.fulfill({ body: '<div id="root"></div>', contentType: "text/html" }));
  await page.goto("http://example.test/");
  await initializeList(page, removeRandomUUID);
  return page;
}

async function initializeList(page: Page, removeRandomUUID: boolean, paid = false) {
  await page.evaluate(({ withoutUUID, paid }) => {
    const state = window as any;
    state.__rows = [{
      kind: "BACKDATED_PURCHASE", id: "purchase-1", reference: "Giro-001",
      purchaseDate: "2026-01-01", dueDate: "2026-02-01", paymentMethod: "GIRO",
      amountCents: 1_000_000, paidCents: 0, remainingCents: 1_000_000,
      paymentStatus: "UNPAID", createdAt: "2026-01-01T00:00:00Z", payments: [],
    }];
    if (paid) Object.assign(state.__rows[0], { remainingCents: 0, paidCents: 1_000_000, paymentStatus: "PAID" });
    state.__calls = [];
    state.__reject = [];
    state.__resolve = [];
    state.fetch = (_url: string, options: RequestInit) => {
      state.__calls.push(JSON.parse(String(options.body)));
      return new Promise((resolve, reject) => { state.__reject.push(reject); state.__resolve.push(resolve); });
    };
    let nextId = 0;
    Object.defineProperty(window.crypto, "randomUUID", {
      value: withoutUUID ? undefined : () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++nextId).padStart(12, "0")}`,
      configurable: true,
    });
  }, { withoutUUID: removeRandomUUID, paid });
  await page.addScriptTag({ content: bundle });
}

describe("form belanja terdahulu di browser", () => {
  it("tetap membuka daftar saat crypto.randomUUID tidak tersedia", async () => {
    const page = await openList(true);
    await page.getByText("Giro-001").waitFor({ timeout: 5000 });
    await page.close();
  }, 15_000);

  it("mempertahankan permintaan saat modal ditutup ketika pembayaran belum pasti", async () => {
    const page = await openList(false);
    await page.getByRole("button", { name: "Riwayat pembayaran" }).click();
    await page.getByLabel("Nominal Pembayaran (Rp)").fill("1000");
    await page.getByLabel("Tanggal Pembayaran").fill("2026-01-15");
    await page.getByRole("button", { name: "Simpan pembayaran" }).click();
    await page.getByRole("button", { name: "Tutup" }).click();
    await page.getByRole("button", { name: "Riwayat pembayaran" }).click();
    expect(await page.getByRole("button", { name: /Menyimpan|Simpan pembayaran/ }).isDisabled()).toBe(true);
    await page.evaluate(() => (window as any).__reject[0](new Error("koneksi terputus")));
    await page.getByRole("alert").waitFor();
    expect(await page.getByLabel("Nominal Pembayaran (Rp)").inputValue()).toBe("1000");
    expect(await page.getByLabel("Tanggal Pembayaran").inputValue()).toBe("2026-01-15");
    await page.getByRole("button", { name: "Tutup" }).click();
    await page.getByRole("button", { name: "Riwayat pembayaran" }).click();
    await page.getByRole("button", { name: "Simpan pembayaran" }).click();
    const calls = await page.evaluate(() => (window as any).__calls);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    await page.close();
  }, 30_000);

  it("memulihkan permintaan yang belum pasti setelah halaman dimuat ulang", async () => {
    const page = await openList(false);
    await page.getByRole("button", { name: "Riwayat pembayaran" }).click();
    await page.getByLabel("Nominal Pembayaran (Rp)").fill("1000");
    await page.getByLabel("Tanggal Pembayaran").fill("2026-01-15");
    await page.getByRole("button", { name: "Simpan pembayaran" }).click();
    const original = await page.evaluate(() => (window as any).__calls[0]);
    await page.evaluate(() => (window as any).__reject[0](new Error("koneksi terputus")));
    await page.getByRole("alert").waitFor();
    await page.reload();
    await initializeList(page, false);
    await page.getByRole("button", { name: "Riwayat pembayaran" }).click();
    expect(await page.getByLabel("Nominal Pembayaran (Rp)").inputValue()).toBe("1000");
    expect(await page.getByLabel("Tanggal Pembayaran").inputValue()).toBe("2026-01-15");
    await page.getByRole("button", { name: "Simpan pembayaran" }).click();
    expect(await page.evaluate(() => (window as any).__calls[0])).toEqual(original);
    await page.close();
  }, 30_000);

  it("tetap menyediakan percobaan ulang saat pembayaran sudah melunasi tagihan", async () => {
    const page = await openList(false);
    await page.getByRole("button", { name: "Riwayat pembayaran" }).click();
    await page.getByLabel("Nominal Pembayaran (Rp)").fill("10000");
    await page.getByLabel("Tanggal Pembayaran").fill("2026-01-15");
    await page.getByRole("button", { name: "Simpan pembayaran" }).click();
    const original = await page.evaluate(() => (window as any).__calls[0]);
    await page.evaluate(() => (window as any).__reject[0](new Error("koneksi terputus")));
    await page.getByRole("alert").waitFor();
    await page.reload();
    await initializeList(page, false, true);
    await page.getByRole("button", { name: "Riwayat pembayaran" }).click();
    await page.getByRole("button", { name: "Simpan pembayaran" }).click();
    expect(await page.evaluate(() => (window as any).__calls[0])).toEqual(original);
    await page.close();
  }, 30_000);

  it.each(["payment", "purchase"] as const)("tidak mengganti permintaan %s setelah koneksi terputus lalu akses ditolak", async (kind) => {
    const page = await openList(false);
    if (kind === "payment") {
      await page.getByRole("button", { name: "Riwayat pembayaran" }).click();
      await page.getByLabel("Nominal Pembayaran (Rp)").fill("1000");
      await page.getByLabel("Tanggal Pembayaran").fill("2026-01-15");
    } else {
      await page.getByRole("button", { name: "Catat Belanja Terdahulu" }).click();
      await page.getByLabel("Tanggal Pembelian").fill("2026-09-01");
      await page.getByRole("dialog").getByLabel("Tanggal Jatuh Tempo").fill("2026-10-15");
      await page.getByLabel("No. Giro").fill("GIRO-123");
      await page.getByLabel("Nominal Pembelian (Rp)").fill("10000");
    }
    const save = () => page.getByRole("button", { name: kind === "payment" ? "Simpan pembayaran" : "Simpan belanja" });
    await save().click();
    const original = await page.evaluate(() => (window as any).__calls[0]);
    await page.evaluate(() => (window as any).__reject[0](new Error("koneksi terputus")));
    await page.getByRole("alert").waitFor();
    await save().click();
    await page.evaluate(() => (window as any).__resolve[1]({ ok: false, status: 403, json: async () => ({ message: "Akses ditolak" }) }));
    await page.getByRole("alert").getByText("Akses ditolak").waitFor();
    await page.getByRole("button", { name: "Tutup" }).click();
    await page.getByRole("button", { name: kind === "payment" ? "Riwayat pembayaran" : "Catat Belanja Terdahulu" }).click();
    await save().click();
    const calls = await page.evaluate(() => (window as any).__calls);
    expect(calls[2]).toEqual(original);
    await page.close();
  }, 30_000);

  it("memulihkan pembuatan belanja yang belum pasti setelah halaman dimuat ulang", async () => {
    const page = await openList(false);
    await page.getByRole("button", { name: "Catat Belanja Terdahulu" }).click();
    await page.getByLabel("Tanggal Pembelian").fill("2026-09-01");
    await page.getByRole("dialog").getByLabel("Tanggal Jatuh Tempo").fill("2026-10-15");
    await page.getByLabel("No. Giro").fill("GIRO-123");
    await page.getByLabel("Nominal Pembelian (Rp)").fill("10000");
    await page.getByRole("button", { name: "Simpan belanja" }).click();
    const original = await page.evaluate(() => (window as any).__calls[0]);
    await page.evaluate(() => (window as any).__reject[0](new Error("koneksi terputus")));
    await page.getByRole("alert").waitFor();
    await page.reload();
    await initializeList(page, false);
    await page.getByRole("button", { name: "Catat Belanja Terdahulu" }).click();
    expect(await page.getByLabel("No. Giro").inputValue()).toBe("GIRO-123");
    await page.getByRole("button", { name: "Simpan belanja" }).click();
    expect(await page.evaluate(() => (window as any).__calls[0])).toEqual(original);
    await page.evaluate(() => (window as any).__reject[0](new Error("koneksi terputus")));
    await page.getByRole("alert").waitFor();
    await page.getByRole("button", { name: "Tutup" }).click();
    await page.getByRole("button", { name: "Catat Belanja Terdahulu" }).click();
    expect(await page.getByLabel("No. Giro").inputValue()).toBe("GIRO-123");
    await page.getByRole("button", { name: "Simpan belanja" }).click();
    expect(await page.evaluate(() => (window as any).__calls[1])).toEqual(original);
    await page.close();
  }, 30_000);
});
