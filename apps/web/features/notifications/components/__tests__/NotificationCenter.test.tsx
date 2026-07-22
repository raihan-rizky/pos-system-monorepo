import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NotificationCenterView } from "../NotificationCenter";

describe("NotificationCenterView", () => {
  it("shows a red unread count and keeps read history visible", () => {
    const html = renderToStaticMarkup(
      <NotificationCenterView
        open
        unreadCount={3}
        notifications={[
          {
            id: "unread-1",
            eventName: "transaction.approval_requested",
            title: "Persetujuan Transaksi",
            body: "Sales meminta persetujuan transaksi.",
            url: "/dashboard/transactions?status=PENDING_APPROVAL",
            readAt: null,
            createdAt: "2026-07-22T03:00:00.000Z",
          },
          {
            id: "read-1",
            eventName: "inventory-request-created",
            title: "Permintaan stok baru",
            body: "Permintaan stok sudah dibuka.",
            url: "/inventory",
            readAt: "2026-07-22T03:05:00.000Z",
            createdAt: "2026-07-22T02:00:00.000Z",
          },
        ]}
        onToggle={vi.fn()}
        onOpenNotification={vi.fn()}
        onMarkAllAsRead={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Notifikasi, 3 belum dibaca"');
    expect(html).toContain("bg-red-600");
    expect(html).toContain("Persetujuan Transaksi");
    expect(html).toContain("Permintaan stok baru");
    expect(html).toContain("Tandai semua dibaca");
  });

  it("removes the unread number when every notification is read", () => {
    const html = renderToStaticMarkup(
      <NotificationCenterView
        open={false}
        unreadCount={0}
        notifications={[]}
        onToggle={vi.fn()}
        onOpenNotification={vi.fn()}
        onMarkAllAsRead={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Notifikasi"');
    expect(html).not.toContain('aria-label="0 notifikasi belum dibaca"');
  });
});
