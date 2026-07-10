import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MorningCheckModal } from "../InventoryDaySessionPanel";
import type { InventoryDaySessionPreview } from "../../api/inventory-management-api";

vi.mock("@pos/ui", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    Modal: ({ children, title }: any) => (
      <div data-testid="modal-mock">
        {title}
        {children}
      </div>
    ),
  };
});

vi.mock("@/lib/rbac/hooks", () => ({
  useRole: () => ({
    role: "ADMIN",
    canPerform: () => true,
    userId: "user-1",
  }),
}));

describe("MorningCheckModal", () => {
  it("renders empty state UI when there are no production materials", () => {
    const preview: InventoryDaySessionPreview = {
      dateKey: "2026-06-29",
      session: null,
      stockRisk: { negative: [], outOfStock: [], lowStock: [] },
      productionMaterials: [],
      workspaceSafetyItems: [],
      completion: {
        dateKey: "2026-06-29",
        weekKey: "2026-W26",
        isSaturday: false,
        tasks: [],
        blockers: [],
      },
    };

    const html = renderToStaticMarkup(
      <MorningCheckModal
        open={true}
        preview={preview}
        onClose={vi.fn()}
        onDone={vi.fn()}
      />
    );

    expect(html).toContain("Belum ada bahan produksi yang tercatat");
    expect(html).toContain("Sistem belum mendeteksi riwayat pemakaian bahan baku produksi");
    // Button should be enabled (not disabled) when materials empty
    expect(html).toContain("Selesaikan Check In");
    
    // Find the button HTML block
    const buttonMatch = html.match(/<button[^>]*>Selesaikan Check In<\/button>/);
    expect(buttonMatch).not.toBeNull();
    expect(buttonMatch![0]).not.toMatch(/disabled[=\s>]/i);
  });
});
