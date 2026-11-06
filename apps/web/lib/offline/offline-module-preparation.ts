"use client";

// Share the import sites with the POS dialogs so preparation caches the exact
// chunks those dialogs will request when the device is offline.
export const loadPaymentModal = () => import("@/components/PaymentModal");
export const loadOpenShiftModal = () => import("@/components/OpenShiftModal");
export const loadCloseShiftModal = () => import("@/components/CloseShiftModal");

/** Load the modules needed by a POS tab before its connection is lost. */
export async function warmOfflineCheckoutModules() {
  try {
    await Promise.all([
      loadPaymentModal(),
      loadOpenShiftModal(),
      loadCloseShiftModal(),
      import("@/lib/offline/checkout-outbox"),
      import("@/lib/offline/offline-db"),
      import("@/features/pos-search/pos-search"),
      import("@/features/pos-search/pos-stock-filter"),
    ]);
  } catch {
    throw new Error("Modul kasir belum siap. Periksa koneksi dan coba siapkan kembali.");
  }
}
