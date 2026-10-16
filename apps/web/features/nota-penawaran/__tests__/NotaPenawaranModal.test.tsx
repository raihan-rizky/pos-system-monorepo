import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NotaPenawaranModal } from "../components/NotaPenawaranModal";

vi.mock("@/features/invoice-date/hooks/useServerClock", () => ({
  useServerClock: () => ({ now: new Date("2026-10-14T20:30:00Z"), isLoading: false }),
}));
vi.mock("@pos/ui", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

describe("NotaPenawaranModal invoice details", () => {
  it("offers custom or automatic numbering and prefills WIB date/time", () => {
    const html = renderToStaticMarkup(<NotaPenawaranModal open items={[]} role="OWNER" onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(html).toContain("No. Faktur");
    expect(html).toContain("Gunakan otomatis");
    expect(html).toMatch(/type="date"[^>]*value="2026-10-15"/);
    expect(html).toMatch(/type="time"[^>]*value="03:30"/);
  });

  it("shows prefilled but read-only dates for sales", () => {
    const html = renderToStaticMarkup(<NotaPenawaranModal open items={[]} role="SALES" onClose={vi.fn()} onSubmit={vi.fn()} />);
    expect(html).toMatch(/type="date"[^>]*readOnly=""[^>]*value="2026-10-15"/);
  });
});
