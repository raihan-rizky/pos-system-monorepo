import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { NotificationCenterView } from "../NotificationCenter";

describe("NotificationCenterView", () => {
  it("wires pointer drag, edge snapping, resize clamp, and persistence", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "features/notifications/components/NotificationCenter.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("NOTIFICATION_FLOATING_PREFERENCE_KEY");
    expect(source).toContain("localStorage.getItem");
    expect(source).toContain("localStorage.setItem");
    expect(source).toContain("setPointerCapture");
    expect(source).toContain("snapNotificationEdge");
    expect(source).toContain("clampNotificationY");
    expect(source).toContain('window.addEventListener("resize"');
  });

  it("renders a draggable restore tab when notifications are hidden", () => {
    const html = renderToStaticMarkup(
      <NotificationCenterView
        open={false}
        unreadCount={0}
        notifications={[]}
        preference={{ edge: "right", y: 24, hidden: true }}
        dragging={false}
        onToggle={vi.fn()}
        onHide={vi.fn()}
        onRestore={vi.fn()}
        onOpenNotification={vi.fn()}
        onMarkAllAsRead={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Tampilkan notifikasi"');
    expect(html).toContain("hover:-translate-x-1");
    expect(html).not.toContain('aria-label="Notifikasi"');
  });

  it("shows a red unread count and keeps read history visible", () => {
    const html = renderToStaticMarkup(
      <NotificationCenterView
        open
        unreadCount={3}
        preference={{ edge: "right", y: 24, hidden: false }}
        dragging={false}
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
        onHide={vi.fn()}
        onRestore={vi.fn()}
        onOpenNotification={vi.fn()}
        onMarkAllAsRead={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Notifikasi, 3 belum dibaca"');
    expect(html).toContain("bg-red-600");
    expect(html).toContain("Persetujuan Transaksi");
    expect(html).toContain("Permintaan stok baru");
    expect(html).toContain("Tandai semua dibaca");
    expect(html).toContain('aria-label="Sembunyikan notifikasi"');
  });

  it("removes the unread number when every notification is read", () => {
    const html = renderToStaticMarkup(
      <NotificationCenterView
        open={false}
        unreadCount={0}
        notifications={[]}
        preference={{ edge: "left", y: 120, hidden: false }}
        dragging={false}
        onToggle={vi.fn()}
        onHide={vi.fn()}
        onRestore={vi.fn()}
        onOpenNotification={vi.fn()}
        onMarkAllAsRead={vi.fn()}
      />,
    );

    expect(html).toContain('aria-label="Notifikasi"');
    expect(html).not.toContain('aria-label="0 notifikasi belum dibaca"');
  });

  it("opens the panel upward when the control is near the viewport bottom", () => {
    const html = renderToStaticMarkup(
      <NotificationCenterView
        open
        unreadCount={0}
        notifications={[]}
        preference={{ edge: "right", y: 700, hidden: false }}
        viewportHeight={800}
        dragging={false}
        onToggle={vi.fn()}
        onHide={vi.fn()}
        onRestore={vi.fn()}
        onOpenNotification={vi.fn()}
        onMarkAllAsRead={vi.fn()}
      />,
    );

    expect(html).toContain("bottom-full");
    expect(html).toContain("max-height:560px");
  });
});
