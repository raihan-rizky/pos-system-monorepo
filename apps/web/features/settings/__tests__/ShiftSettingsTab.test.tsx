import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShiftSettingsView, type ShiftSettingsViewProps } from "@/components/settings/ShiftSettingsTab";

const defaultProps: ShiftSettingsViewProps = {
  enabled: true,
  isLoading: false,
  isUpdating: false,
  error: null,
  confirmingDisable: false,
  onToggle: vi.fn(),
  onCancelDisable: vi.fn(),
  onConfirmDisable: vi.fn(),
};

describe("ShiftSettingsView", () => {
  it("renders the enabled state and owner guidance", () => {
    const html = renderToStaticMarkup(<ShiftSettingsView {...defaultProps} />);

    expect(html).toContain("Gunakan Shift Kasir");
    expect(html).toContain("Kasir wajib membuka shift sebelum transaksi.");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Matikan Shift Kasir");
  });

  it("renders the disabled state without requiring an active shift", () => {
    const html = renderToStaticMarkup(
      <ShiftSettingsView {...defaultProps} enabled={false} />,
    );

    expect(html).toContain("Kasir bisa bertransaksi tanpa membuka shift.");
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Shift yang terbuka akan dipause, bukan ditutup.");
  });

  it("renders the disable confirmation warning", () => {
    const html = renderToStaticMarkup(
      <ShiftSettingsView {...defaultProps} confirmingDisable />,
    );

    expect(html).toContain("Konfirmasi Matikan Shift");
    expect(html).toContain("History shift tetap aman");
    expect(html).toContain("Lanjutkan");
    expect(html).toContain("Batal");
  });

  it("renders mutation errors", () => {
    const html = renderToStaticMarkup(
      <ShiftSettingsView {...defaultProps} error="Gagal menyimpan pengaturan shift." />,
    );

    expect(html).toContain("Gagal menyimpan pengaturan shift.");
  });
});
