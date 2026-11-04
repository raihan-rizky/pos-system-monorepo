import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SpecialPricingSettingsTab from "../SpecialPricingSettingsTab";

vi.mock("../../hooks/useSpecialPricingSettings", () => ({
  useSpecialPricingSettings: () => ({ data: false, isPending: false, isError: false }),
  useUpdateSpecialPricingSettings: () => ({ isPending: false, isSuccess: false, reset: vi.fn(), mutate: vi.fn() }),
}));

describe("keterangan pengaturan Harga Khusus", () => {
  it("menjelaskan bahwa harga manual dan harga custom nota tetap tersedia", () => {
    const html = renderToStaticMarkup(<SpecialPricingSettingsTab />);
    expect(html).toContain("Harga Agen/Dinas");
    expect(html).toContain("Harga custom untuk satu nota tetap tersedia");
    expect(html).toContain("input Harga Khusus di pembayaran untuk pelanggan Industri/Pemerintah tidak tersedia");
  });
});
