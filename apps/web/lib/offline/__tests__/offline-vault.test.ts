import { webcrypto } from "node:crypto";
import { beforeAll, expect, it, vi } from "vitest";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));
const authorization = { role: "CASHIER", authorizationFingerprint: "0123456789abcdef", revocationMarker: null, vaultGeneration: "0123456789abcdef0123456789abcdef" };

it("encrypts the POS page and opens it only with the original PIN", async () => {
  const { sealOfflinePage, openOfflinePage } = await import("../../../public/offline-vault.mjs");
  const html = "<!doctype html><html><body>PRIVATE CASHIER DATA</body></html>";
  const vault = await sealOfflinePage({ cashierId: "cashier-1", storeId: "store-1", ...authorization, html, pin: "123456", preparedAt: "2026-11-01T00:00:00.000Z" });
  expect(JSON.stringify(vault)).not.toContain("PRIVATE CASHIER DATA");
  await expect(openOfflinePage(vault, "654321", new Date("2026-11-02T00:00:00.000Z"))).rejects.toThrow();
  await expect(openOfflinePage(vault, "123456", new Date("2026-11-02T00:00:00.000Z"))).resolves.toBe(html);
});

it("rejects tampered identity or preparation time", async () => {
  const { sealOfflinePage, openOfflinePage } = await import("../../../public/offline-vault.mjs");
  const vault = await sealOfflinePage({ cashierId: "cashier-1", storeId: "store-1", ...authorization, html: "<html>POS</html>", pin: "123456", preparedAt: "2026-11-01T00:00:00.000Z" });
  await expect(openOfflinePage({ ...vault, cashierId: "other" }, "123456", new Date("2026-11-02T00:00:00.000Z"))).rejects.toThrow();
  await expect(openOfflinePage({ ...vault, preparedAt: "2026-11-02T00:00:00.000Z" }, "123456", new Date("2026-11-02T01:00:00.000Z"))).rejects.toThrow();
  await expect(openOfflinePage({ ...vault, role: "OWNER" }, "123456", new Date("2026-11-02T01:00:00.000Z"))).rejects.toThrow();
  await expect(openOfflinePage({ ...vault, authorizationFingerprint: "fedcba9876543210" }, "123456", new Date("2026-11-02T01:00:00.000Z"))).rejects.toThrow();
  await expect(openOfflinePage({ ...vault, revocationMarker: "0".repeat(32) }, "123456", new Date("2026-11-02T01:00:00.000Z"))).rejects.toThrow();
  await expect(openOfflinePage({ ...vault, vaultGeneration: "0".repeat(32) }, "123456", new Date("2026-11-02T01:00:00.000Z"))).rejects.toThrow();
});

it("requires a verified role and permission fingerprint when saving a page", async () => {
  const { sealOfflinePage } = await import("../../../public/offline-vault.mjs");
  const input = { cashierId: "cashier-1", storeId: "store-1", html: "<html>POS</html>", pin: "123456", preparedAt: "2026-11-01T00:00:00.000Z" };
  await expect(sealOfflinePage({ ...input, role: undefined, authorizationFingerprint: undefined, revocationMarker: undefined, vaultGeneration: undefined })).rejects.toThrow();
  await expect(sealOfflinePage({ ...input, ...authorization, authorizationFingerprint: "" })).rejects.toThrow();
  const vault = await sealOfflinePage({ ...input, ...authorization });
  expect(vault).toMatchObject({ version: 2, ...authorization });
});

it("does not open an expired page or accept an invalid PIN", async () => {
  const { sealOfflinePage, openOfflinePage } = await import("../../../public/offline-vault.mjs");
  await expect(sealOfflinePage({ cashierId: "cashier-1", storeId: "store-1", ...authorization, html: "<html>POS</html>", pin: "123", preparedAt: "2026-11-01T00:00:00.000Z" })).rejects.toThrow();
  const vault = await sealOfflinePage({ cashierId: "cashier-1", storeId: "store-1", ...authorization, html: "<html>POS</html>", pin: "123456", preparedAt: "2026-11-01T00:00:00.000Z" });
  await expect(openOfflinePage(vault, "123456", new Date("2026-11-09T00:00:00.000Z"))).rejects.toThrow();
});
