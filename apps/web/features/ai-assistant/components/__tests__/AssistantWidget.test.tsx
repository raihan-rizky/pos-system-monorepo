import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn() }),
}));

import { AssistantWidget } from "../AssistantWidget";

describe("AssistantWidget", () => {
  it("renders a floating assistant button", () => {
    const html = renderToStaticMarkup(<AssistantWidget />);

    expect(html).toContain("floating-ai-button");
    expect(html).toContain("fixed");
    expect(html).toContain("bottom-6");
  });

  it("renders chat panel markup when opened by default", () => {
    const html = renderToStaticMarkup(<AssistantWidget defaultOpen />);

    expect(html).toContain("Tanya AI");
    expect(html).toContain("Pak Teladan");
    expect(html).toContain("Halo, saya siap membantu");
    expect(html).toContain('maxLength="2000"');
    expect(html).toContain("Maksimal 2.000 karakter per pesan.");
  });

  it("renders source metadata under AI messages", () => {
    const html = renderToStaticMarkup(
      <AssistantWidget
        defaultOpen
        initialMessages={[
          {
            role: "assistant",
            content: "Ini produk low stock.",
            metadata: {
              sourceLabel: "Tool stok rendah",
              generatedAt: "2026-06-26T10:15:00.000Z",
            },
          },
        ]}
      />,
    );

    expect(html).toContain("Sumber: Tool stok rendah");
    expect(html).toContain("26 Jun 2026");
  });

  it("renders a safe collapsed status log under assistant messages", () => {
    const html = renderToStaticMarkup(
      <AssistantWidget
        defaultOpen
        initialMessages={[
          {
            role: "assistant",
            content: "Ini produk low stock.",
            actionLog: [
              {
                id: "step-1",
                label: "Processing request",
                status: "done",
                occurredAt: "2026-06-26T10:15:00.000Z",
              },
              {
                id: "step-2",
                label: "Checking data",
                status: "done",
                occurredAt: "2026-06-26T10:16:00.000Z",
              },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain("Status");
    expect(html).toContain("Checking data");
    expect(html).not.toContain("get_low_stock_items");
  });

  it("keeps status log collapsed by default even if active", () => {
    const html = renderToStaticMarkup(
      <AssistantWidget
        defaultOpen
        initialMessages={[
          {
            role: "assistant",
            content: "",
            actionLog: [
              {
                id: "request-1",
                label: "Request sent",
                status: "done",
                occurredAt: "2026-06-27T01:00:00.000Z",
              },
              {
                id: "planning-1",
                label: "Processing request",
                status: "active",
                occurredAt: "2026-06-27T01:00:01.000Z",
              },
            ],
          },
        ]}
      />,
    );

    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('aria-label="Proses AI"');
    expect(html).not.toContain("Request sent"); // Should be hidden because collapsed
    expect(html).toContain("Processing request"); // Still visible as latest status in summary label
  });

  it("renders workflow payloads under assistant answers", () => {
    const html = renderToStaticMarkup(
      <AssistantWidget
        defaultOpen
        initialMessages={[
          {
            role: "assistant",
            content: "Ikuti alur aman ini ya.",
            workflow: {
              id: "faq-q01-add-product",
              title: "Tambah produk baru",
              route: "/products",
              actionLabel: "Buka Produk",
              sourceRef: "docs/help/faq.md#q1",
              steps: [
                {
                  id: "faq-q01-add-product-step-1",
                  title: "Buka katalog",
                  description: "Masuk ke halaman Produk.",
                  route: "/products",
                  actionLabel: "Buka Produk",
                  iconKey: "package",
                },
              ],
            },
          },
        ]}
      />,
    );

    expect(html).toContain("Tambah produk baru");
    expect(html).toContain("Buka katalog");
    expect(html).toContain('href="/products"');
  });

  it("renders workflow above status progress log when both are present", () => {
    const html = renderToStaticMarkup(
      <AssistantWidget
        defaultOpen
        initialMessages={[
          {
            role: "assistant",
            content: "Ikuti alur aman ini ya.",
            actionLog: [
              {
                id: "step-1",
                label: "Processing request",
                status: "done",
                occurredAt: "2026-06-26T10:15:00.000Z",
              },
            ],
            workflow: {
              id: "faq-q01-add-product",
              title: "Tambah produk baru",
              route: "/products",
              actionLabel: "Buka Produk",
              sourceRef: "docs/help/faq.md#q1",
              steps: [
                {
                  id: "faq-q01-add-product-step-1",
                  title: "Buka katalog",
                  description: "Masuk ke halaman Produk.",
                  route: "/products",
                  actionLabel: "Buka Produk",
                  iconKey: "package",
                },
              ],
            },
          },
        ]}
      />,
    );

    const workflowIndex = html.indexOf("Tambah produk baru");
    const statusIndex = html.indexOf("Status");
    expect(workflowIndex).toBeGreaterThan(-1);
    expect(statusIndex).toBeGreaterThan(-1);
    expect(workflowIndex).toBeLessThan(statusIndex);
  });

  it("renders role-specific template questions/quick prompts", () => {
    // For INVENTORY role
    const htmlInventory = renderToStaticMarkup(
      <AssistantWidget defaultOpen userRole="INVENTORY" />
    );
    expect(htmlInventory).toContain("Cek stok barang menipis");
    expect(htmlInventory).not.toContain("Barang terlaris minggu ini");
    expect(htmlInventory).toContain("Bagaimana cara melakukan stock opname?");
    expect(htmlInventory).toContain("Input penerimaan barang");
    expect(htmlInventory).toContain("Update stok satu produk");

    // For SALES role
    const htmlSales = renderToStaticMarkup(
      <AssistantWidget defaultOpen userRole="SALES" />
    );
    expect(htmlSales).toContain("Cari pelanggan Toko Makmur");
    expect(htmlSales).toContain("Cek sisa piutang Agen Sabar Subur");
    expect(htmlSales).toContain("Rekap transaksi pelanggan Budi");
    expect(htmlSales).toContain("Buat rekap pelanggan 30 hari dalam Excel");
    expect(htmlSales).toContain("Tambah pelanggan baru");

    // For CASHIER role
    const htmlCashier = renderToStaticMarkup(
      <AssistantWidget defaultOpen userRole="CASHIER" />
    );
    expect(htmlCashier).toContain("Cek stok Kertas HVS");
    expect(htmlCashier).toContain("Berapa harga Kertas HVS?");
    expect(htmlCashier).toContain("Lihat daftar transaksi pending");
    expect(htmlCashier).toContain("Catat pengeluaran operasional");
    expect(htmlCashier).toContain("Mulai shift kasir");

    // For OWNER/ADMIN role
    const htmlOwner = renderToStaticMarkup(
      <AssistantWidget defaultOpen userRole="OWNER" />
    );
    expect(htmlOwner).toContain("Ringkasan penjualan hari ini");
    expect(htmlOwner).toContain("Daftar produk terlaris hari ini");
    expect(htmlOwner).toContain("Cara mengatur hak akses role RBAC");
    expect(htmlOwner).toContain("Analisis performa finansial 30 hari terakhir");
    expect(htmlOwner).toContain("Cari supplier Sumber Makmur");
    expect(htmlOwner).toContain("Rekap finansial bulanan");
    expect(htmlOwner).toContain("Rekap pelanggan bulanan");
    expect(htmlOwner).toContain("assistant-quick-prompt-glow");

    const htmlAdmin = renderToStaticMarkup(
      <AssistantWidget defaultOpen userRole="ADMIN" />
    );
    expect(htmlAdmin).toContain("Tambah produk baru");
    expect(htmlAdmin).toContain("Tambah supplier baru");
    expect(htmlAdmin).toContain("Tambah sales baru");
  });

  it("explains how to use quick prompts and exposes descriptive prompt labels", () => {
    const html = renderToStaticMarkup(
      <AssistantWidget defaultOpen userRole="CASHIER" />
    );

    expect(html).toContain("Ide cepat buat kamu");
    expect(html).toContain("Klik prompt untuk isi pesan");
    expect(html).toContain('aria-label="Pakai prompt: Cek stok Kertas HVS"');
    expect(html).toContain('title="Isi pesan dengan prompt ini"');
  });

  it("renders generated report files with download-again action and advice", () => {
    const html = renderToStaticMarkup(
      <AssistantWidget
        defaultOpen
        initialMessages={[{
          role: "assistant",
          content: "Rekapnya sudah siap.",
          generatedFile: {
            name: "rekap-pelanggan-30d.xlsx",
            format: "xlsx",
            label: "Rekap Pelanggan",
            action: { kind: "export_customer_recap", period: "30d", format: "xlsx" },
            advice: ["Follow up pelanggan dengan piutang tertinggi."],
            downloaded: true,
          },
        }]}
      />,
    );

    expect(html).toContain("rekap-pelanggan-30d.xlsx");
    expect(html).toContain("Download ulang");
    expect(html).toContain("Saran Pak Teladan");
    expect(html).toContain("Follow up pelanggan dengan piutang tertinggi.");
  });

  it("offers a prepared report without downloading it automatically", () => {
    const html = renderToStaticMarkup(
      <AssistantWidget
        defaultOpen
        initialMessages={[{
          role: "assistant",
          content: "Rekapnya siap diunduh.",
          generatedFile: {
            name: "laporan-keuangan-monthly.pdf",
            format: "pdf",
            label: "Laporan Keuangan",
            action: { kind: "export_financial_report", period: "monthly", format: "pdf" },
            advice: [],
            downloaded: false,
          },
        }]}
      />,
    );

    expect(html).toContain("Download PDF");
    expect(html).not.toContain("Download ulang");
  });

  it("lets Pak Teladan proactively surface unread notifications", () => {
    const html = renderToStaticMarkup(
      <AssistantWidget
        defaultOpen
        notificationSnapshot={{
          unreadCount: 2,
          notifications: [
            {
              id: "notification-1",
              eventName: "shopping-request-created",
              title: "Permohonan belanja baru",
              body: "Rina mengajukan PB-001.",
              url: "/suppliers?tab=shopping-requests",
              readAt: null,
              createdAt: "2026-07-22T02:00:00.000Z",
            },
          ],
          markAsRead: vi.fn(),
        }}
      />,
    );

    expect(html).toContain("Pak Teladan ngabarin");
    expect(html).toContain("2 notifikasi belum dibaca");
    expect(html).toContain("Permohonan belanja baru");
    expect(html).toContain('aria-label="2 notifikasi belum dibaca"');
  });
});

