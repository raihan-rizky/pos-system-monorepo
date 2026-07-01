import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

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
    expect(htmlInventory).toContain("Cara input penerimaan barang");

    // For SALES role
    const htmlSales = renderToStaticMarkup(
      <AssistantWidget defaultOpen userRole="SALES" />
    );
    expect(htmlSales).toContain("Cari pelanggan Toko Makmur");
    expect(htmlSales).toContain("Cek sisa piutang Agen Sabar Subur");
    expect(htmlSales).toContain("Rekap transaksi pelanggan Budi");

    // For CASHIER role
    const htmlCashier = renderToStaticMarkup(
      <AssistantWidget defaultOpen userRole="CASHIER" />
    );
    expect(htmlCashier).toContain("Cek stok Kertas HVS");
    expect(htmlCashier).toContain("Berapa harga Kertas HVS?");
    expect(htmlCashier).toContain("Lihat daftar transaksi pending");

    // For OWNER/ADMIN role
    const htmlOwner = renderToStaticMarkup(
      <AssistantWidget defaultOpen userRole="OWNER" />
    );
    expect(htmlOwner).toContain("Ringkasan penjualan hari ini");
    expect(htmlOwner).toContain("Daftar produk terlaris hari ini");
    expect(htmlOwner).toContain("Cara mengatur hak akses role RBAC");
  });
});

