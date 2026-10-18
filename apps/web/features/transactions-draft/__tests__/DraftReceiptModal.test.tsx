import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DraftReceiptModal } from "@/components/DraftReceiptModal";
import type { Transaction } from "@/hooks/useTransactions";

vi.mock("@/hooks/useSettings", () => ({ useStoreSettings: () => ({ data: null }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ canPerform: () => true }) }));
vi.mock("@pos/ui", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

describe("DraftReceiptModal numbering", () => {
  it("places the saved number and automatic reset alongside the recipient fields", () => {
    const transaction = { id: "draft-1", draftNumber: "PNW-TLD-20261018-003", status: "DRAFT", total: 10000, items: [], createdAt: "2026-10-18T03:00:00Z" } as unknown as Transaction;
    const html = renderToStaticMarkup(<DraftReceiptModal open onClose={vi.fn()} transaction={transaction} />);
    expect(html).toContain("No. Faktur");
    expect(html).toContain("Gunakan otomatis");
    expect(html).toContain('name="draftNumber"');
    expect(html).toContain('value="003/PNW-TLD/18/X/2026"');
    expect(html).toContain("disimpan ke transaksi sebelum dicetak");
  });
});
