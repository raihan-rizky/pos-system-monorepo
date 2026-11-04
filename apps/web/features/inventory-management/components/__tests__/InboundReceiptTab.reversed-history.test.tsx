import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ index: 0, reversed: true }));
vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const hooks = {
    useState: (initial: unknown) => {
      const index = state.index++;
      if (index === 0) return [[{
        id: "receipt-1", status: "APPROVED", stockReversed: state.reversed,
        goodsPurchaseNumber: "PB-1", supplier: { name: "Supplier" },
        createdAt: "2026-11-01T00:00:00Z", lines: [],
      }], vi.fn()];
      return [index === 1 ? false : initial, vi.fn()];
    },
    useRef: (initial: unknown) => ({ current: initial }),
    useCallback: (callback: (...args: any[]) => unknown) => callback,
    useEffect: () => {},
  };
  return { ...actual, ...hooks, default: { ...(actual as unknown as { default: Record<string, unknown> }).default, ...hooks } };
});
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ canPerform: () => true }) }));
vi.mock("../../api/inventory-management-api", () => ({ fetchInboundReceipts: vi.fn() }));
import { InboundReceiptTab } from "../InboundReceiptTab";

describe("penanda pembalikan di riwayat penerimaan", () => {
  it("menunjukkan bahwa dampak stok sudah dibalik sambil mempertahankan status asal", () => {
    state.index = 0;
    state.reversed = true;
    const html = renderToStaticMarkup(<InboundReceiptTab />);
    expect(html).toContain("Disetujui");
    expect(html).toContain("Stok sudah dibalik");
    state.index = 0;
    state.reversed = false;
    expect(renderToStaticMarkup(<InboundReceiptTab />)).not.toContain("Stok sudah dibalik");
  });
});
