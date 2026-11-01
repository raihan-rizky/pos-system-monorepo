import { webcrypto } from "node:crypto";
import { beforeAll, expect, it, vi } from "vitest";

beforeAll(() => vi.stubGlobal("crypto", webcrypto));

it("encrypts the POS page and opens it only with the original PIN", async () => {
  const { sealOfflinePage, openOfflinePage } = await import("../../../public/offline-vault.mjs");
  const html = "<!doctype html><html><body>PRIVATE CASHIER DATA</body></html>";
  const vault = await sealOfflinePage({ cashierId: "cashier-1", storeId: "store-1", html, pin: "123456", preparedAt: "2026-11-01T00:00:00.000Z" });
  expect(JSON.stringify(vault)).not.toContain("PRIVATE CASHIER DATA");
  await expect(openOfflinePage(vault, "654321", new Date("2026-11-02T00:00:00.000Z"))).rejects.toThrow();
  await expect(openOfflinePage(vault, "123456", new Date("2026-11-02T00:00:00.000Z"))).resolves.toBe(html);
});

it("rejects tampered identity or preparation time", async () => {
  const { sealOfflinePage, openOfflinePage } = await import("../../../public/offline-vault.mjs");
  const vault = await sealOfflinePage({ cashierId: "cashier-1", storeId: "store-1", html: "<html>POS</html>", pin: "123456", preparedAt: "2026-11-01T00:00:00.000Z" });
  await expect(openOfflinePage({ ...vault, cashierId: "other" }, "123456", new Date("2026-11-02T00:00:00.000Z"))).rejects.toThrow();
  await expect(openOfflinePage({ ...vault, preparedAt: "2026-11-02T00:00:00.000Z" }, "123456", new Date("2026-11-02T01:00:00.000Z"))).rejects.toThrow();
});

it("does not open an expired page or accept an invalid PIN", async () => {
  const { sealOfflinePage, openOfflinePage } = await import("../../../public/offline-vault.mjs");
  await expect(sealOfflinePage({ cashierId: "cashier-1", storeId: "store-1", html: "<html>POS</html>", pin: "123", preparedAt: "2026-11-01T00:00:00.000Z" })).rejects.toThrow();
  const vault = await sealOfflinePage({ cashierId: "cashier-1", storeId: "store-1", html: "<html>POS</html>", pin: "123456", preparedAt: "2026-11-01T00:00:00.000Z" });
  await expect(openOfflinePage(vault, "123456", new Date("2026-11-09T00:00:00.000Z"))).rejects.toThrow();
});
