import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { bundleReactHarness } from "../../../product-stock-groups/__tests__/browser-harness.mjs";

const require = createRequire(import.meta.url);
const { build } = require(require.resolve("esbuild", { paths: [require.resolve("vitest")] }));
const { chromium, expect } = require("@playwright/test");
const web = fileURLToPath(new URL("../../../../", import.meta.url));
const origin = "https://pos.example.test";
const bundle = await build({
  stdin: {
    resolveDir: web,
    loader: "tsx",
    contents: `
      import React, { useState } from "react";
      import { createRoot } from "react-dom/client";
      import LoginPage from "./app/login/page";
      import { RoleProvider, useRole } from "./components/providers/RoleProvider";
      import { useCart } from "./hooks/useCart";
      import { buildDefaultRolePermissions } from "./features/rbac/helpers/rbac-core";

      const permissions = buildDefaultRolePermissions();
      let account = "sales-1";
      const root = createRoot(document.getElementById("root"));
      window.permissionStatus = 200;
      window.permissionChecks = 0;
      window.deferPermission = false;
      window.clearSessionRequests = 0;
      window.fetch = async (url) => {
        if (url === "/api/auth/clear-session") {
          window.clearSessionRequests++;
          return Response.json({ ok: true });
        }
        window.permissionChecks++;
        const snapshot = { user: { id: account, name: "Sales", role: "SALES", storeId: "shop" },
          authorizationFingerprint: "version-1", permissions };
        if (window.deferPermission) await new Promise(resolve => { window.releasePermission = resolve; });
        return window.permissionStatus === 200 ? Response.json(snapshot)
          : new Response(null, { status: window.permissionStatus });
      };
      function Checkout() {
        const { userId, storeId } = useRole();
        const cart = useCart(userId ? { userId, storeId } : null);
        const [customer, setCustomer] = useState("");
        const [payment, setPayment] = useState("");
        return <main>
          <label>Pelanggan<input value={customer} onChange={event => setCustomer(event.target.value)} /></label>
          <label>Pembayaran<input value={payment} onChange={event => setPayment(event.target.value)} /></label>
          <button type="button" disabled={!cart.hasLoadedStorage} onClick={() => cart.addServiceItem({
            printingServiceId: "service", name: "Cetak A4", price: 3000, quantity: 2, unit: "lembar", needsMaterial: false,
          })}>Tambah item</button>
          <output data-testid="quantity">{cart.totalItems}</output>
        </main>;
      }
      window.openAs = (userId) => {
        account = userId;
        root.render(<RoleProvider key={userId} role="SALES" userId={userId} userName="Sales" storeId="shop"
          authorizationFingerprint="version-1" permissions={permissions}><Checkout /></RoleProvider>);
      };
      window.openLogin = () => root.render(<LoginPage />);
      window.openAs(account);
    `,
  },
  bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  alias: { "@": web },
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{
    name: "browser-fixture",
    setup(plugin) {
      plugin.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "pathname", namespace: "fixture" }));
      plugin.onResolve({ filter: /utils[\\/]supabase[\\/]client$/ }, () => ({ path: "supabase", namespace: "fixture" }));
      plugin.onResolve({ filter: /components[\\/]ui[\\/]beams-background$/ }, () => ({ path: "beams", namespace: "fixture" }));
      plugin.onLoad({ filter: /^pathname$/, namespace: "fixture" }, () => ({ contents: 'export const usePathname = () => "/pos";' }));
      plugin.onLoad({ filter: /^beams$/, namespace: "fixture" }, () => ({ contents: 'export const BeamsBackground = ({ children }) => children;' }));
      plugin.onLoad({ filter: /^supabase$/, namespace: "fixture" }, () => ({
        contents: `
          export const createClient = () => ({ auth: {
            signOut: async ({ scope }) => {
              window.loginSignOutScope = scope;
              return { error: null };
            },
            signInWithPassword: async () => {
              window.staleCookieAtSignIn = document.cookie.includes("sb-test-auth-token");
              window.staleStorageAtSignIn = localStorage.getItem("sb-test-auth-token");
              return { error: new Error("Kata sandi uji salah") };
            },
          } });
        `,
      }));
    },
  }],
});

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route(origin + "/pos", route => route.fulfill({
    contentType: "text/html", body: '<html lang="id"><body><div id="root"></div></body></html>',
  }));
  await page.goto(origin + "/pos");
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => window.permissionChecks === 1);
  const customer = page.getByRole("textbox", { name: "Pelanggan" });
  const payment = page.getByRole("textbox", { name: "Pembayaran" });
  await customer.fill("Pelanggan uji");
  await payment.fill("6000");
  await page.getByRole("button", { name: "Tambah item" }).click();
  await expect(page.getByTestId("quantity")).toHaveText("2");

  await page.evaluate(() => {
    window.permissionStatus = 503;
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.getByRole("status").filter({ hasText: "Koneksi sedang dipulihkan" })).toBeVisible();
  await expect(customer).toHaveValue("Pelanggan uji");
  await expect(payment).toHaveValue("6000");
  await expect(page.getByTestId("quantity")).toHaveText("2");
  await page.evaluate(() => { window.permissionStatus = 200; });
  await expect(page.getByText("Koneksi sedang dipulihkan.", { exact: false })).toHaveCount(0);
  await expect(customer).toHaveValue("Pelanggan uji");

  await page.evaluate(() => {
    window.deferPermission = true;
    window.dispatchEvent(new Event("focus"));
  });
  await page.waitForFunction(() => typeof window.releasePermission === "function");
  await page.evaluate(() => {
    window.dispatchEvent(new Event("pos:session-ended"));
    window.deferPermission = false;
    window.releasePermission();
  });
  await expect(page.getByRole("heading", { name: "Sesi Anda berakhir" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Masuk lagi" })).toHaveAttribute("href", "/login");
  await expect(customer).not.toBeVisible();
  if (process.env.POS_CAPTURE_SESSION_HELP_IMAGE === "1") {
    const { css } = await bundleReactHarness("", ["features/rbac/components/AccessStatus.tsx"]);
    await page.addStyleTag({ content: css });
    await page.getByRole("heading", { name: "Sesi Anda berakhir" }).locator("..").screenshot({
      path: fileURLToPath(new URL("../../../../public/images/changelog/sesi-perangkat-2026-11-11.png", import.meta.url)),
    });
  }

  await page.evaluate(() => window.openAs("sales-2"));
  await expect(page.getByTestId("quantity")).toHaveText("0");
  await page.evaluate(() => window.openAs("sales-1"));
  await expect(page.getByTestId("quantity")).toHaveText("2");
  await page.evaluate(() => {
    window.permissionStatus = 403;
    window.dispatchEvent(new Event("focus"));
  });
  await expect(page.getByRole("heading", { name: "Akses akun berubah" })).toBeVisible();
  await expect(customer).not.toBeVisible();

  await page.evaluate(() => {
    document.cookie = "sb-test-auth-token=expired; path=/";
    localStorage.setItem("sb-test-auth-token", "expired");
    window.openLogin();
  });
  await page.locator("#login-username").fill("kasir-uji");
  await page.locator("#login-password").fill("kata-sandi-uji");
  await page.locator("#login-submit").click();
  await expect(page.getByText("Kata sandi uji salah")).toBeVisible();
  const login = await page.evaluate(() => ({
    scope: window.loginSignOutScope,
    staleCookie: window.staleCookieAtSignIn,
    staleStorage: window.staleStorageAtSignIn,
    clearSessionRequests: window.clearSessionRequests,
  }));
  assert.deepEqual(login, { scope: "local", staleCookie: false, staleStorage: null, clearSessionRequests: 0 });

  assert.deepEqual(errors, []);
  console.log("PASS: form survives temporary outage, stale response cannot undo logout, cart restore checks ownership, and login clears stale artifacts locally");
} finally {
  await browser.close();
}
