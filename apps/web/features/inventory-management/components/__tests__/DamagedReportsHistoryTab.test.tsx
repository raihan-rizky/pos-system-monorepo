import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DamagedReportsHistoryTab } from "../DamagedReportsHistoryTab";

vi.mock("@/hooks/useInventoryLogs", () => ({
  useInventoryLogs: () => ({
    isLoading: false,
    isError: false,
    data: {
      data: [
        {
          id: "log-1",
          productId: "product-1",
          type: "OUT",
          reason: "WASTE",
          quantity: 2,
          note: "Kemasan pecah\nProof URL: https://prnt.sc/dmg123\nResolved proof: https://image.prntscr.com/image/damaged.png",
          createdBy: "user-1",
          person: "Siti",
          createdAt: "2026-06-26T08:00:00.000Z",
          status: "PENDING",
          approvedBy: null,
          approverName: null,
          decidedAt: null,
          rejectionReason: null,
          product: {
            id: "product-1",
            name: "Sirup Melon",
            sku: "SRP-001",
            unit: "botol",
            stock: 8,
            imageUrl: null,
            category: { name: "Minuman", icon: null },
          },
        },
      ],
      pagination: {
        page: 1,
        limit: 20,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    },
  }),
}));

describe("DamagedReportsHistoryTab", () => {
  it("renders damaged report history with proof thumbnail", () => {
    const html = renderToStaticMarkup(<DamagedReportsHistoryTab />);

    expect(html).toContain("Riwayat Laporan Barang Rusak");
    expect(html).toContain("Sirup Melon");
    expect(html).toContain("SRP-001");
    expect(html).toContain("Kemasan pecah");
    expect(html).toContain("https://image.prntscr.com/image/damaged.png");
    expect(html).toContain("Bukti foto barang rusak");
  });
});
