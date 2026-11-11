import { describe, expect, it, vi } from "vitest";
vi.mock("../HistoryClientPage", () => ({ default: function OrdinaryHistory() { return null; } }));
vi.mock("@/features/transaction-history/components/ReceiptHistoryClient", () => ({ ReceiptHistoryClient: function ReceiptHistory() { return null; } }));
import HistoryPage from "../page";

describe("Riwayat berdasarkan konteks", () => {
  it("membuka penerimaan pada tanggal lama yang dipilih", async () => {
    const page = await HistoryPage({ searchParams: Promise.resolve({ mode: "receipt", date: "2026-11-05" }) });
    expect(page.props.context).toMatchObject({ mode: "receipt", date: "2026-11-05" });
  });
  it("mempertahankan Riwayat biasa dan meneruskan pencarian nomor nota", async () => {
    const page = await HistoryPage({ searchParams: Promise.resolve({ search: "INV-OLD" }) });
    expect(page.props.initialSearch).toBe("INV-OLD");
  });
});
