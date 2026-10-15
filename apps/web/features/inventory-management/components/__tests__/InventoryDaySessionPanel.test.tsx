import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InventoryDaySessionPanel } from "../InventoryDaySessionPanel";
import type { InventoryDaySessionPreview } from "../../api/inventory-management-api";

const preview: InventoryDaySessionPreview = {
  dateKey: "2026-10-14",
  session: null,
  stockRisk: { negative: [], outOfStock: [], lowStock: [] },
  productionMaterials: [],
  workspaceSafetyItems: [],
  completion: { dateKey: "2026-10-14", weekKey: "2026-W42", isSaturday: false, tasks: [], blockers: [] },
};

function renderPanel(data: InventoryDaySessionPreview | null, loading = false, error: string | null = null) {
  let call = 0;
  const states = [data, loading, false, error];
  vi.spyOn(React, "useState").mockImplementation((initial?: unknown) => {
    const index = call++;
    if (index < states.length) return [states[index], vi.fn()] as never;
    return [typeof initial === "function" ? initial() : initial, vi.fn()] as never;
  });
  return renderToStaticMarkup(<InventoryDaySessionPanel />);
}

afterEach(() => vi.restoreAllMocks());

describe("InventoryDaySessionPanel", () => {
  it("offers checkout without a prior session and removes check-in controls", () => {
    const html = renderPanel(preview);
    expect(html).not.toContain("Check In");
    expect(html).not.toContain("Morning Check");
    const button = html.match(/<button[^>]*>[\s\S]*?Check Out<\/button>/)?.[0];
    expect(button).toBeDefined();
    expect(button).not.toMatch(/\sdisabled(?:=|\s|>)/);
  });

  it("disables checkout for a closed day", () => {
    const html = renderPanel({ ...preview, session: { status: "CHECKED_OUT" } as NonNullable<InventoryDaySessionPreview["session"]> });
    expect(html).toMatch(/<button[^>]*\sdisabled(?:=|\s|>)/);
  });

  it("keeps loading visible and checkout unavailable before preview arrives", () => {
    const html = renderPanel(null, true);
    expect(html).toContain("Memuat status inventaris");
    expect(html).toMatch(/<button[^>]*\sdisabled(?:=|\s|>)/);
  });

  it("shows fetch errors and keeps unavailable checkout disabled", () => {
    const html = renderPanel(null, false, "Gagal memuat status inventaris.");
    expect(html).toContain("Gagal memuat status inventaris.");
    expect(html).toMatch(/<button[^>]*\sdisabled(?:=|\s|>)/);
  });
});
