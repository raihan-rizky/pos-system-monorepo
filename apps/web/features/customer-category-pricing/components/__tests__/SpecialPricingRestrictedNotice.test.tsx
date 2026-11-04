import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SpecialPricingRestrictedNotice } from "../SpecialPricingRestrictedNotice";

const state = vi.hoisted(() => ({ data: false as boolean | undefined, isPending: false, isFetchedAfterMount: true, isError: false, refetch: vi.fn() }));
vi.mock("../../hooks/useSpecialPricingSettings", () => ({ useSpecialPricingSettings: () => state }));

describe("petunjuk Harga Khusus bagi pengguna selain Owner", () => {
  beforeEach(() => Object.assign(state, { data: false, isPending: false, isFetchedAfterMount: true, isError: false }));
  it("asks the user to contact the owner when disabled", () => {
    const html = renderToStaticMarkup(<SpecialPricingRestrictedNotice />);
    expect(html).toContain("Fitur Harga Khusus dinonaktifkan");
    expect(html).toContain("Hubungi Owner");
    expect(html).not.toContain("Tambah aturan");
  });
  it("does not expose rule management when enabled", () => {
    state.data = true;
    const html = renderToStaticMarkup(<SpecialPricingRestrictedNotice />);
    expect(html).toContain("hanya tersedia untuk Owner");
    expect(html).not.toContain("Tambah aturan");
  });
  it("reports loading and errors without offering rule management", () => {
    state.isFetchedAfterMount = false;
    expect(renderToStaticMarkup(<SpecialPricingRestrictedNotice />)).toContain("Memuat pengaturan");
    state.isError = true;
    const html = renderToStaticMarkup(<SpecialPricingRestrictedNotice />);
    expect(html).toContain("Coba lagi");
    expect(html).not.toContain("Tambah aturan");
  });
});
