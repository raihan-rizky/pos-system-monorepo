import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  HELP_ROLE_CONTENT,
  resolveHelpStepVisual,
} from "../components/HelpContent";
import {
  VisualGuideMockup,
  isKnownHelpVisualTarget,
} from "../components/VisualGuideMockup";
import HelpDiagramStepper from "../components/HelpDiagramStepper";
import { HELP_VISUAL_PAGE_CONFIG } from "../components/help-visual-registry";

describe("visual help guides", () => {
  it("renders the selected visual target as a read-only fake page", () => {
    const html = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "settings",
          target: "settings-rbac-tab",
          callout: "Klik tab RBAC di panel pengaturan.",
        }}
        stepNumber={2}
        stepTitle="Buka Tab RBAC"
      />,
    );

    expect(html).toContain('data-help-visual-mock="settings"');
    expect(html).toContain('aria-label="Mock halaman Pengaturan"');
    expect(html).toContain('data-help-target-active="true"');
    expect(html).toContain('data-help-callout-number="2"');
    expect(html).toContain("Klik tab RBAC di panel pengaturan.");
  });

  it("resolves a valid visual target for every existing guide step", () => {
    for (const [role, guides] of Object.entries(HELP_ROLE_CONTENT)) {
      for (const guide of guides) {
        guide.steps.forEach((step, index) => {
          const visual = resolveHelpStepVisual({
            role,
            guideId: guide.id,
            guideTitle: guide.title,
            step,
            stepIndex: index,
          });

          expect(visual, `${role}/${guide.id}/${step.title}`).toBeDefined();
          expect(isKnownHelpVisualTarget(visual), `${role}/${guide.id}/${visual.page}.${visual.target}`)
            .toBe(true);
        });
      }
    }
  });

  it("uses modal visual triggers for AI Assistant guide steps", () => {
    const aiGuide = HELP_ROLE_CONTENT.AI_ASSISTANT[0];
    const html = renderToStaticMarkup(
      <HelpDiagramStepper
        guideId={aiGuide.id}
        guideTitle={aiGuide.title}
        role="AI_ASSISTANT"
        steps={aiGuide.steps}
      />,
    );

    expect(html).toContain('data-help-visual-mode="modal"');
    expect(html).toContain('data-help-visual-modal-trigger="true"');
    expect(html).not.toContain('data-help-visual-mock="assistant"');
  });

  it("renders screenshot-like static page templates instead of generic target cards", () => {
    const settingsHtml = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "settings",
          target: "settings-rbac-tab",
          callout: "Klik tab RBAC di panel pengaturan.",
        }}
        stepNumber={2}
        stepTitle="Buka Tab RBAC"
      />,
    );
    const historyHtml = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "history",
          target: "history-action-menu",
          callout: "Klik menu titik tiga pada transaksi target.",
        }}
        stepNumber={3}
        stepTitle="Pilih Aksi"
      />,
    );
    const posHtml = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "pos",
          target: "pos-cart",
          callout: "Periksa item di keranjang sebelum bayar.",
        }}
        stepNumber={3}
        stepTitle="Periksa Keranjang"
      />,
    );

    expect(settingsHtml).toContain("Pengaturan");
    expect(settingsHtml).toContain("RBAC");
    expect(settingsHtml).toContain("Matrix Modul");
    expect(settingsHtml).not.toContain("Data Contoh 1");

    expect(historyHtml).toContain("Riwayat Transaksi");
    expect(historyHtml).toContain("Cari invoice, pelanggan, nama produk, atau sales...");
    expect(historyHtml).toContain("No. Invoice");
    expect(historyHtml).toContain("Pembayaran");
    expect(historyHtml).not.toContain("Total Belanja");
    expect(historyHtml).not.toContain("Data Contoh 1");

    expect(posHtml).toContain("Produk");
    expect(posHtml).toContain("Layanan");
    expect(posHtml).toContain("Cari produk");
    expect(posHtml).toContain("Keranjang");
    expect(posHtml).not.toContain("Data Contoh 1");
  });

  it("renders a scaled full app-shell desktop canvas with sidebar and matching icons", () => {
    const settingsHtml = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "settings",
          target: "settings-rbac-tab",
          callout: "Klik tab RBAC di panel pengaturan.",
        }}
        stepNumber={2}
        stepTitle="Buka Tab RBAC"
      />,
    );
    const historyHtml = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "history",
          target: "history-action-menu",
          callout: "Klik menu titik tiga pada transaksi target.",
        }}
        stepNumber={3}
        stepTitle="Pilih Aksi"
      />,
    );
    const posHtml = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "pos",
          target: "pos-cart",
          callout: "Periksa item di keranjang sebelum bayar.",
        }}
        stepNumber={3}
        stepTitle="Periksa Keranjang"
      />,
    );

    expect(settingsHtml).toContain('data-help-preview-canvas="1366x768"');
    expect(settingsHtml).toContain('data-help-preview-sidebar="true"');
    expect(settingsHtml).toContain('data-help-preview-nav-active="settings"');
    expect(settingsHtml).toContain('data-help-preview-assistant-button="true"');
    expect(settingsHtml).toContain("Kasir");
    expect(settingsHtml).toContain("Riwayat");
    expect(settingsHtml).toContain("Pengaturan");
    expect(settingsHtml).toContain("lucide-settings");
    expect(settingsHtml).toContain("lucide-calculator");

    expect(historyHtml).toContain('data-help-preview-nav-active="history"');
    expect(historyHtml).toContain("lucide-wallet-cards");

    expect(posHtml).toContain('data-help-preview-nav-active="pos"');
    expect(posHtml).toContain("lucide-shopping-cart");
  });

  it("uses the real collapsed shell dimensions and keeps scrolling inside the page viewport", () => {
    const html = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "inventory",
          target: "inventory-primary",
          callout: "Buka workspace inventaris.",
        }}
        stepNumber={1}
        stepTitle="Buka Inventaris"
      />,
    );

    expect(html).toContain('data-help-preview-sidebar-mode="collapsed"');
    expect(html).toContain('data-help-preview-sidebar-width="76"');
    expect(html).toContain('data-help-preview-viewport-size="1290x768"');
    expect(html).toContain('data-help-page-scroll="both"');
    expect(html).toContain("w-[76px]");
    expect(html).toContain("min-w-0");
    expect(html).toContain("min-h-0");
    expect(html).toContain("overflow-auto");
    expect(html).not.toContain("Toko Teladan");
    expect(html).not.toContain("Read-only");
  });

  it("keeps semantic fidelity contracts in sync for all twelve production surfaces", () => {
    const contracts = [
      {
        page: "settings" as const,
        target: "settings-primary",
        sources: [
          new URL("../../../app/(main)/settings/page.tsx", import.meta.url),
          new URL("../../../components/settings/StoreInfoTab.tsx", import.meta.url),
        ],
        markers: ["Pengaturan", "Info Toko", "Informasi Toko"],
      },
      {
        page: "history" as const,
        target: "history-primary",
        sources: [new URL("../../../app/(main)/history/page.tsx", import.meta.url)],
        markers: ["Riwayat Transaksi", "Daftar seluruh transaksi dan invoice toko", "No. Invoice"],
      },
      {
        page: "pos" as const,
        target: "pos-primary",
        sources: [
          new URL("../../../app/(main)/pos/POSClientPage.tsx", import.meta.url),
          new URL("../../../components/CartSidebar.tsx", import.meta.url),
        ],
        markers: ["Produk", "Layanan", "Cari produk, SKU, atau barcode...", "Keranjang"],
      },
      {
        page: "products" as const,
        target: "products-primary",
        sources: [new URL("../../../app/(main)/products/page.tsx", import.meta.url)],
        markers: ["INVENTARIS LIVE", "Pusat Produk", "Total Produk", "Aktivitas Grup"],
      },
      {
        page: "inventory" as const,
        target: "inventory-primary",
        sources: [
          new URL("../../inventory-management/components/InventoryWorkspace.tsx", import.meta.url),
        ],
        markers: ["Manajemen Inventaris", "Tugas", "Transaksi", "Riwayat", "Tindak Lanjut Operasional"],
      },
      {
        page: "suppliers" as const,
        target: "suppliers-primary",
        sources: [new URL("../../suppliers/components/SupplierPageShell.tsx", import.meta.url)],
        markers: [
          "Manajemen Supplier",
          "Kelola supplier dan pantau rekap stock in dari pembelian.",
          "Rekap Stock In",
        ],
      },
      {
        page: "customers" as const,
        target: "customers-primary",
        sources: [new URL("../../../app/(main)/customers/page.tsx", import.meta.url)],
        markers: [
          "Customer Workspace",
          "Semua Pelanggan",
          "Cari nama pelanggan, nomor HP, email, atau perusahaan...",
        ],
      },
      {
        page: "finance" as const,
        target: "finance-primary",
        sources: [new URL("../../../app/(main)/keuangan/page.tsx", import.meta.url)],
        markers: ["Net Cash Flow", "Arus Kas Harian", "Pemasukan", "Pengeluaran"],
      },
      {
        page: "shift" as const,
        target: "shift-primary",
        sources: [new URL("../../../app/(main)/shift/page.tsx", import.meta.url)],
        markers: [
          "Riwayat Shift Kasir",
          "Daftar rekapan sesi kasir dan selisih kas laci uang",
          "Ekspetasi Tutup Laci",
        ],
      },
      {
        page: "production" as const,
        target: "production-primary",
        sources: [new URL("../../../app/(main)/production/page.tsx", import.meta.url)],
        markers: ["Papan Produksi", "Pantau job order dari struk sampai diserahkan.", "Aktivitas Produksi"],
      },
      {
        page: "salespersons" as const,
        target: "salespersons-primary",
        sources: [new URL("../../../app/(main)/salespersons/page.tsx", import.meta.url)],
        markers: ["Manajemen sales", "Tim Sales", "Cari nama sales...", "Top Performer"],
      },
      {
        page: "assistant" as const,
        target: "assistant-primary",
        sources: [
          new URL("../../ai-assistant/components/AssistantWidget.tsx", import.meta.url),
        ],
        markers: ["Pak Teladan", "Asisten", "Tanya AI, share ide, atau minta bantuan..."],
      },
    ];

    for (const contract of contracts) {
      const productionSource = contract.sources
        .map((source) => readFileSync(source, "utf8"))
        .join("\n");
      const html = renderToStaticMarkup(
        <VisualGuideMockup
          visual={{
            page: contract.page,
            target: contract.target,
            callout: `Panduan ${contract.page}`,
          }}
          stepNumber={1}
          stepTitle={contract.page}
        />,
      );

      expect(html, `${contract.page}.fidelity`).toContain(
        `data-help-fidelity-page="${contract.page}"`,
      );
      for (const marker of contract.markers) {
        expect(productionSource, `${contract.page}.source.${marker}`).toContain(marker);
        expect(html, `${contract.page}.preview.${marker}`).toContain(marker);
      }
    }
  });

  it("renders each guide target in an explicit page state instead of one composite screen", () => {
    for (const [page, config] of Object.entries(HELP_VISUAL_PAGE_CONFIG)) {
      for (const group of config.groups) {
        for (const target of group.targets) {
          const html = renderToStaticMarkup(
            <VisualGuideMockup
              visual={{
                page: page as keyof typeof HELP_VISUAL_PAGE_CONFIG,
                target: target.key,
                callout: `Panduan ${target.label}`,
              }}
              stepNumber={1}
              stepTitle={target.label}
            />,
          );

          expect(html, `${page}.${target.key}.state`).toContain("data-help-preview-state=");
          expect(html, `${page}.${target.key}.active`).toContain(
            `data-help-target="${target.key}"`,
          );
        }
      }
    }
  }, 20000);

  it("selects the real tab, subtab, and overlay state for representative workflow targets", () => {
    const cases = [
      ["settings", "settings-info-store", "settings-store", "Info Toko"],
      ["settings", "settings-whatsapp-tab", "settings-whatsapp", "Integrasi WhatsApp"],
      ["settings", "settings-rbac-tab", "settings-rbac", "Permission RBAC"],
      ["products", "products-special-price-tab", "products-special-prices", "Harga Khusus"],
      ["products", "products-stock-group-tab", "products-group-activity", "Aktivitas Grup"],
      ["inventory", "inventory-inbound", "inventory-inbound", "Penerimaan Barang"],
      ["inventory", "inventory-stock-log-tab", "inventory-stock-log", "Log Stok"],
      ["inventory", "inventory-matching", "inventory-matching-modal", "Matching Stok Harian"],
      ["suppliers", "suppliers-add", "suppliers-form-open", "Tambah Supplier"],
      ["suppliers", "suppliers-create-request", "suppliers-request-open", "Buat Daftar Belanja"],
      ["customers", "customers-debt-tab", "customers-debt", "Piutang"],
      ["customers", "customers-pay-debt", "customers-payment-open", "Bayar Piutang"],
      ["finance", "finance-expense-form", "finance-expense-form-open", "Form Pengeluaran"],
      ["shift", "shift-opening-cash", "shift-open-modal", "Modal Laci"],
      ["shift", "shift-closing-cash", "shift-close-modal", "Uang Tutup Laci"],
      ["shift", "shift-edit", "shift-edit-modal", "Ubah Shift"],
      ["production", "production-whatsapp", "production-whatsapp-confirm", "WhatsApp"],
      ["salespersons", "salespersons-add", "salespersons-add-modal", "Tambah Sales"],
      ["salespersons", "salespersons-detail", "salespersons-detail-open", "Detail Sales"],
      ["assistant", "assistant-button", "assistant-closed", "Pak Teladan"],
      ["assistant", "assistant-input", "assistant-open", "Tanya AI, share ide, atau minta bantuan..."],
    ] as const;

    for (const [page, target, state, marker] of cases) {
      const html = renderToStaticMarkup(
        <VisualGuideMockup
          visual={{ page, target, callout: marker }}
          stepNumber={1}
          stepTitle={marker}
        />,
      );

      expect(html, `${page}.${target}.state`).toContain(
        `data-help-preview-state="${state}"`,
      );
      expect(html, `${page}.${target}.marker`).toContain(marker);
    }
  });

  it("activates the financial-report icon for report targets and keeps page headers non-sticky", () => {
    const html = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "finance",
          target: "finance-export",
          callout: "Buka menu ekspor laporan.",
        }}
        stepNumber={1}
        stepTitle="Ekspor Laporan"
      />,
    );

    expect(html).toContain('data-help-preview-nav-active="financial-report"');
    expect(html).not.toContain('data-help-preview-nav-active="finance"');
    expect(html).not.toContain("sticky top-0");
  });

  it("marks the active target for automatic internal scrolling when a step changes", () => {
    const html = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "salespersons",
          target: "salespersons-detail",
          callout: "Buka detail sales.",
        }}
        stepNumber={4}
        stepTitle="Detail Sales"
      />,
    );

    expect(html).toContain('data-help-auto-scroll-target="salespersons-detail"');
    expect(html).toContain('data-help-page-scroll="both"');
  });

  it("keeps the app-shell page clipped and aligned with actual page layouts", () => {
    const settingsHtml = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "settings",
          target: "settings-rbac-tab",
          callout: "Klik tab RBAC di panel pengaturan.",
        }}
        stepNumber={2}
        stepTitle="Buka Tab RBAC"
      />,
    );
    const historyHtml = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "history",
          target: "history-filter",
          callout: "Gunakan filter untuk mencari transaksi.",
        }}
        stepNumber={1}
        stepTitle="Filter Riwayat"
      />,
    );
    const posHtml = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "pos",
          target: "pos-products",
          callout: "Cari dan pilih produk.",
        }}
        stepNumber={1}
        stepTitle="Pilih Produk"
      />,
    );

    expect(settingsHtml).toContain('data-help-appshell-overflow-guard="true"');
    expect(settingsHtml).toContain('data-help-page-viewport="clipped"');
    expect(settingsHtml).toContain("contain:layout paint");
    expect(settingsHtml).toContain("max-w-full");
    expect(settingsHtml).toContain("will-change-transform");

    expect(settingsHtml).toContain('data-help-actual-page="settings"');
    expect(settingsHtml).toContain('data-help-fidelity-page="settings"');
    expect(settingsHtml).toContain('data-help-preview-state="settings-rbac"');
    expect(settingsHtml).toContain("Permission RBAC");
    expect(settingsHtml).toContain("min-w-[1290px]");
    expect(settingsHtml).toContain("text-brand-600");

    expect(historyHtml).toContain('data-help-actual-page="history"');
    expect(historyHtml).toContain("Daftar seluruh transaksi dan invoice toko");
    expect(historyHtml).toContain("Cari invoice, pelanggan, nama produk, atau sales...");
    expect(historyHtml).toContain("Semua Kategori");
    expect(historyHtml).toContain("Filter cepat");
    expect(historyHtml).toContain("Harian");
    expect(historyHtml).toContain("Mingguan");
    expect(historyHtml).toContain("Bulanan");
    expect(historyHtml).toContain("Surat Jalan saja");
    expect(historyHtml).toContain('data-help-fidelity-page="history"');
    expect(historyHtml).toContain("min-w-[1420px]");
    expect(historyHtml).toContain("Tanggal");
    expect(historyHtml).toContain("Sales");
    expect(historyHtml).toContain("Item");
    expect(historyHtml).toContain("lucide-search");
    expect(historyHtml).toContain("lucide-calendar-days");
    expect(historyHtml).toContain("lucide-truck");
    expect(historyHtml).not.toContain("Read-only");

    expect(posHtml).toContain('data-help-actual-page="pos"');
    expect(posHtml).toContain('data-help-fidelity-page="pos"');
    expect(posHtml).toContain("Produk");
    expect(posHtml).toContain("Layanan");
    expect(posHtml).toContain("Cari produk, SKU, atau barcode...");
    expect(posHtml).toContain("Stok tersedia");
    expect(posHtml).toContain("w-[340px]");
    expect(posHtml).toContain("lucide-search");
    expect(posHtml).toContain("lucide-check");
    expect(posHtml).toContain("lucide-shopping-cart");
    expect(posHtml).not.toContain("Pilih produk, cek keranjang");
    expect(posHtml).not.toContain("Read-only");
  });

  it("renders an inline overlay on the active guide target without a separate focus panel", () => {
    const html = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "settings",
          target: "settings-rbac-tab",
          callout: "Klik tab RBAC di panel pengaturan.",
        }}
        stepNumber={2}
        stepTitle="Buka Tab RBAC"
      />,
    );

    expect(html).not.toContain("data-help-focus-panel");
    expect(html).not.toContain("data-help-focus-target");
    expect(html).toContain('data-help-overlay-target="settings-rbac-tab"');
    expect(html).toContain('data-help-callout-number="2"');
    expect(html).toContain("Tab RBAC");
    expect(html).toContain("Klik tab RBAC di panel pengaturan.");
  });

  it("adds smooth motion hooks to the page preview and active target callout", () => {
    const html = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "settings",
          target: "settings-rbac-tab",
          callout: "Klik tab RBAC di panel pengaturan.",
        }}
        stepNumber={2}
        stepTitle="Buka Tab RBAC"
      />,
    );

    expect(html).toContain('data-help-animation="page-preview"');
    expect(html).toContain('data-help-animation="active-target"');
    expect(html).toContain('data-help-overlay-animation="target-callout"');
    expect(html).toContain("transition-all");
    expect(html).toContain("duration-500");
    expect(html).toContain("motion-safe:animate-pulse");
  });

  it("renders every registered visual target in its resolved page state", () => {
    for (const [page, config] of Object.entries(HELP_VISUAL_PAGE_CONFIG)) {
      for (const group of config.groups) {
        for (const target of group.targets) {
          const html = renderToStaticMarkup(
            <VisualGuideMockup
              visual={{
                page: page as keyof typeof HELP_VISUAL_PAGE_CONFIG,
                target: target.key,
                callout: `Panduan ${target.label}`,
              }}
              stepNumber={1}
              stepTitle={target.label}
            />,
          );
          expect(html, `${page}.${target.key}`).toContain(`data-help-target="${target.key}"`);
        }
      }
    }
  }, 20000);

  it("renders an inline overlay for every registered visual target", () => {
    for (const [page, config] of Object.entries(HELP_VISUAL_PAGE_CONFIG)) {
      for (const group of config.groups) {
        for (const target of group.targets) {
          const html = renderToStaticMarkup(
            <VisualGuideMockup
              visual={{
                page: page as keyof typeof HELP_VISUAL_PAGE_CONFIG,
                target: target.key,
                callout: `Panduan ${target.label}`,
              }}
              stepNumber={1}
              stepTitle={target.label}
            />,
          );

          expect(html, `${page}.${target.key}`).toContain(`data-help-overlay-target="${target.key}"`);
        }
      }
    }
  }, 20000);

  it("renders exactly one active highlight for every resolved target state", () => {
    for (const [page, config] of Object.entries(HELP_VISUAL_PAGE_CONFIG)) {
      for (const group of config.groups) {
        for (const target of group.targets) {
          const html = renderToStaticMarkup(
            <VisualGuideMockup
              visual={{
                page: page as keyof typeof HELP_VISUAL_PAGE_CONFIG,
                target: target.key,
                callout: `Panduan ${target.label}`,
              }}
              stepNumber={1}
              stepTitle={target.label}
            />,
          );

          const activeTargets = html.match(/data-help-target-active="true"/g) ?? [];
          expect(activeTargets, `${page}.${target.key}`).toHaveLength(1);
        }
      }
    }
  }, 20000);

  it("adds glow effects to every active right-side visual step target", () => {
    for (const [page, config] of Object.entries(HELP_VISUAL_PAGE_CONFIG)) {
      for (const group of config.groups) {
        for (const target of group.targets) {
          const html = renderToStaticMarkup(
            <VisualGuideMockup
              visual={{
                page: page as keyof typeof HELP_VISUAL_PAGE_CONFIG,
                target: target.key,
                callout: `Panduan ${target.label}`,
              }}
              stepNumber={1}
              stepTitle={target.label}
            />,
          );

          expect(html, `${page}.${target.key}`).toContain('data-help-glow="step-target"');
          expect(html, `${page}.${target.key}`).toContain('data-help-overlay-glow="step-callout"');
          expect(html, `${page}.${target.key}`).toContain('data-help-callout-glow="step-number"');
          expect(html, `${page}.${target.key}`).toContain('data-help-glow-animation="pulse"');
          expect(html, `${page}.${target.key}`).toContain('data-help-overlay-glow-animation="pulse"');
          expect(html, `${page}.${target.key}`).toContain('data-help-callout-glow-animation="pulse"');
          expect(html, `${page}.${target.key}`).toContain("help-step-glow-animated");
          expect(html, `${page}.${target.key}`).toContain("help-step-callout-glow-animated");
        }
      }
    }
  }, 20000);

  it("defines reduced-motion-safe CSS for animated help glow", () => {
    const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8");

    expect(css).toContain("@keyframes help-step-glow");
    expect(css).toContain("@keyframes help-step-callout-glow");
    expect(css).toContain(".help-step-glow-animated");
    expect(css).toContain(".help-step-callout-glow-animated");
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.help-step-glow-animated[\s\S]*\.help-step-callout-glow-animated[\s\S]*animation: none/,
    );
  });

  it("renders representative full-page states for active guide targets", () => {
    const settingsHtml = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "settings",
          target: "settings-rbac-tab",
          callout: "Klik tab RBAC di panel pengaturan.",
        }}
        stepNumber={2}
        stepTitle="Buka Tab RBAC"
      />,
    );
    const historyHtml = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "history",
          target: "history-action-menu",
          callout: "Klik menu titik tiga pada transaksi target.",
        }}
        stepNumber={3}
        stepTitle="Pilih Aksi"
      />,
    );
    const posHtml = renderToStaticMarkup(
      <VisualGuideMockup
        visual={{
          page: "pos",
          target: "pos-payment-modal",
          callout: "Konfirmasi pembayaran di modal.",
        }}
        stepNumber={4}
        stepTitle="Konfirmasi Pembayaran"
      />,
    );

    expect(settingsHtml).toContain('data-help-step-state="settings-rbac-active"');
    expect(settingsHtml).toContain("RBAC");

    expect(historyHtml).toContain('data-help-step-state="history-action-menu-open"');
    expect(historyHtml).toContain("Menu Aksi Transaksi");
    expect(historyHtml).toContain("Ubah Tanggal Invoice");

    expect(posHtml).toContain('data-help-step-state="pos-payment-modal-open"');
    expect(posHtml).toContain("Modal Pembayaran");
    expect(posHtml).toContain("Metode Bayar");
  });
});
