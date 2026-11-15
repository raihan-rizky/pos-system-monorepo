import { expect, it, vi } from "vitest";

vi.mock("@/components/PaymentModal", () => ({}));
vi.mock("@/components/OpenShiftModal", () => ({}));
vi.mock("@/components/CloseShiftModal", () => ({}));
vi.mock("@/lib/offline/checkout-outbox", () => ({}));
vi.mock("@/lib/offline/offline-db", () => ({}));
vi.mock("@/features/pos-search/pos-search", () => ({}));
vi.mock("@/features/pos-search/pos-stock-filter", () => ({}));
vi.mock("@/lib/offline/offline-pricing", () => { throw new Error("pricing chunk unavailable"); });

import { warmOfflineCheckoutModules } from "../offline-module-preparation";

it("requires the offline pricing module to be available before declaring checkout ready", async () => {
  await expect(warmOfflineCheckoutModules()).rejects.toThrow("Modul kasir belum siap");
});
