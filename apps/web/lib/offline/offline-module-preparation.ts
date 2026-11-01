"use client";

/** Load the modules needed by a POS tab before its connection is lost. */
export async function warmOfflineCheckoutModules() {
  try {
    await Promise.all([
      import("@/components/PaymentModal"),
      import("@/components/OpenShiftModal"),
      import("@/components/CloseShiftModal"),
      import("@/lib/offline/checkout-outbox"),
      import("@/lib/offline/offline-db"),
      import("@/features/pos-search/pos-search"),
      import("@/features/pos-search/pos-stock-filter"),
    ]);
  } catch {
    throw new Error("Modul kasir belum siap. Periksa koneksi dan coba siapkan kembali.");
  }
}
