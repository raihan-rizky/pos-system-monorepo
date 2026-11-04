import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SettingsPage from "@/app/(main)/settings/page";

const state = vi.hoisted(() => ({ role: "OWNER", search: "tab=special-pricing" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search) }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ role: state.role, canPerform: () => true }) }));
vi.mock("@/components/settings/StoreInfoTab", () => ({ default: () => <div>Panel info toko</div> }));
vi.mock("@/components/settings/WhatsAppTab", () => ({ default: () => null }));
vi.mock("@/components/settings/OfflineSyncTab", () => ({ default: () => null }));
vi.mock("@/components/settings/NotificationsTab", () => ({ default: () => null }));
vi.mock("@/components/settings/RbacTab", () => ({ default: () => null }));
vi.mock("@/components/settings/DatabaseResetTab", () => ({ default: () => null }));
vi.mock("@/components/settings/ShiftSettingsTab", () => ({ default: () => null }));
vi.mock("@/features/product-price-rounding/components/PriceRoundingSettingsTab", () => ({ default: () => null }));
vi.mock("@/features/customer-category-pricing/components/SpecialPricingSettingsTab", () => ({ default: () => <div>Panel pengaturan harga khusus</div> }));

describe("tautan langsung pengaturan Harga Khusus", () => {
  it("membuka tab Harga Khusus untuk Owner", () => {
    state.role = "OWNER";
    state.search = "tab=special-pricing";
    const html = renderToStaticMarkup(<SettingsPage />);
    expect(html).toContain("Panel pengaturan harga khusus");
    expect(html).not.toContain("Panel info toko");
  });
  it("tetap membatasi pengaturan untuk pengguna lain", () => {
    state.role = "ADMIN";
    const html = renderToStaticMarkup(<SettingsPage />);
    expect(html).not.toContain("Panel pengaturan harga khusus");
    expect(html).toContain("Panel info toko");
  });
});
