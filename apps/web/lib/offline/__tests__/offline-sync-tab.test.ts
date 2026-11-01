import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ role: "OWNER" }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ role: identity.role }) }));
vi.mock("@/hooks/useOfflineSync", () => ({
  useOfflineSync: () => ({
    summary: { pending: 0, syncing: 0, failed: 1, pendingApproval: 0, lastSyncAt: null },
    isOnline: true, isSyncing: false, error: null,
    syncNow: vi.fn(), clearSynced: vi.fn(), retryRecord: vi.fn(),
    shifts: [{ id: "closed-shift", cashierId: "cashier-1", storeId: "store-1", status: "CLOSED", openedAt: "2026-11-01T00:00:00Z", openSynced: true, closeSynced: true }],
    records: [{
      clientMutationId: "offline-review-1", status: "FAILED_FINAL", createdAt: "2026-11-01T00:00:00Z",
      lastError: "Produk perlu diperiksa", serverTransactionId: null,
      payload: { originCashierId: "cashier-1", originStoreId: "store-1", originalTotal: 2000,
        paymentMethod: "TRANSFER", amountPaid: 2000,
        payments: [{ method: "CASH", amount: 500 }, { method: "TRANSFER", amount: 1500 }],
        items: [{ productId: "p1", name: "Kertas", quantity: 2 }] },
    }, {
      clientMutationId: "another-cashier-sale", status: "FAILED_FINAL", createdAt: "2026-11-01T00:00:00Z",
      lastError: "Rahasia", serverTransactionId: null,
      payload: { originCashierId: "cashier-2", originStoreId: "store-1", originalTotal: 1000, items: [{ productId: "p2", name: "Barang lain", quantity: 1 }] },
    }, {
      clientMutationId: "foreign-store-sale", status: "FAILED_FINAL", createdAt: "2026-11-01T00:00:00Z",
      lastError: "Tidak boleh terlihat", serverTransactionId: null,
      payload: { originCashierId: "cashier-3", originStoreId: "store-2", originalTotal: 5000, items: [{ productId: "p3", name: "Barang toko lain", quantity: 1 }] },
    }, {
      clientMutationId: "late-shift-sale", status: "PENDING_SYNC", createdAt: "2026-11-01T00:00:00Z",
      serverTransactionId: null, payload: { originCashierId: "cashier-1", originStoreId: "store-1", shiftId: "closed-shift", originalTotal: 3000, items: [{ productId: "p5", name: "Transaksi terlambat", quantity: 1 }] },
    }, {
      clientMutationId: "legacy-unknown", status: "FAILED_FINAL", createdAt: "2026-11-01T00:00:00Z",
      serverTransactionId: null, payload: { originalTotal: 4000, items: [{ productId: "p4", name: "Barang lama", quantity: 1 }] },
    }],
    currentIdentity: { cashierId: "cashier-1", storeId: "store-1" },
  }),
}));

import OfflineSyncTab from "@/components/settings/OfflineSyncTab";

it("shows the failed sale, its error, its items, and a retry action", () => {
  const html = renderToStaticMarkup(React.createElement(OfflineSyncTab));
  expect(html).toContain("offline-review-1");
  expect(html).toContain("Produk perlu diperiksa");
  expect(html).toContain("Kertas");
  expect(html).toContain("Nominal dibayar");
  expect(html).toContain("Tunai");
  expect(html).toContain("Transfer");
  expect(html).toContain("1.500");
  expect(html).toContain("Coba lagi");
});

it("offers PIN preparation and explains which device data the PIN protects", () => {
  const html = renderToStaticMarkup(React.createElement(OfflineSyncTab));
  expect(html).toContain("PIN offline");
  expect(html).toContain("Siapkan POS offline");
  expect(html).toContain("katalog dan antrean transaksi belum terenkripsi");
  expect(html).not.toContain("Membuka ulang POS tanpa koneksi belum tersedia");
});

it("restricts the settings view and its counts to the current store", () => {
  identity.role = "ADMIN";
  const html = renderToStaticMarkup(React.createElement(OfflineSyncTab));
  expect(html).toContain("another-cashier-sale");
  expect(html).not.toContain("foreign-store-sale");
  expect(html).not.toContain("Barang toko lain");
  expect(html).not.toContain("Tidak boleh terlihat");
  expect(html).toContain("transaksi lama tanpa identitas toko");
  expect(html).not.toContain("Barang lama");
  expect(html).not.toContain("legacy-unknown");
});

it("lets an Owner inspect and export legacy records without assigning an origin", () => {
  identity.role = "OWNER";
  const html = renderToStaticMarkup(React.createElement(OfflineSyncTab));
  expect(html).toContain("Pemulihan transaksi lama");
  expect(html).toContain("legacy-unknown");
  expect(html).toContain("Barang lama");
  expect(html).toContain("Unduh data transaksi");
  expect(html).not.toContain("foreign-store-sale");
});

it("keeps legacy record contents hidden from an Admin and the cashier view", () => {
  identity.role = "ADMIN";
  const admin = renderToStaticMarkup(React.createElement(OfflineSyncTab));
  identity.role = "OWNER";
  const cashier = renderToStaticMarkup(React.createElement(OfflineSyncTab, { ownOnly: true }));
  expect(admin).not.toContain("legacy-unknown");
  expect(admin).not.toContain("Barang lama");
  expect(cashier).not.toContain("legacy-unknown");
  expect(cashier).not.toContain("Barang lama");
});

it("lets an Owner export a sale associated with an already synchronized closed shift", () => {
  identity.role = "OWNER";
  const html = renderToStaticMarkup(React.createElement(OfflineSyncTab));
  expect(html).toContain("Transaksi perlu rekonsiliasi shift");
  expect(html).toContain("late-shift-sale");
  expect(html).toContain("Unduh data transaksi");
  expect(html).not.toContain("foreign-store-sale");
});

it("lets an Owner export other unsaved same-store records for reconciliation", () => {
  identity.role = "OWNER";
  const html = renderToStaticMarkup(React.createElement(OfflineSyncTab));
  const records = html.split('id="offline-records-heading"')[1];
  expect(records).toContain("offline-review-1");
  expect(records).toContain("Unduh data transaksi");
});

it("restricts the cashier view to their own records", () => {
  const html = renderToStaticMarkup(React.createElement(OfflineSyncTab, { ownOnly: true }));
  expect(html).toContain("offline-review-1");
  expect(html).not.toContain("another-cashier-sale");
  expect(html).not.toContain("Barang lain");
  expect(html).not.toContain("Hapus riwayat yang sudah sync");
});
