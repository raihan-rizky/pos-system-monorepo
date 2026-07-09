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
    expect(posHtml).toContain("Keranjang Belanja");
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
    expect(settingsHtml).toContain("max-w-[1600px] px-4 md:px-8 pt-6 pb-20");
    expect(settingsHtml).toContain("flex flex-col sm:flex-row gap-6");
    expect(settingsHtml).toContain("px-6 sm:px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold");
    expect(settingsHtml).toContain("flex-1 bg-white border border-surface-100 rounded-2xl shadow-sm p-6");
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
    expect(historyHtml).toContain("bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm");
    expect(historyHtml).toContain("flex-1 flex flex-col overflow-hidden relative");
    expect(historyHtml).toContain("relative px-4 md:px-8 pt-4 pb-0 bg-white border-b border-surface-100");
    expect(historyHtml).toContain("md:block px-4 md:px-8 py-4 bg-white border-b border-surface-100 space-y-3");
    expect(historyHtml).toContain("flex-1 overflow-y-auto px-4 md:px-8 relative");
    expect(historyHtml).toContain("hidden md:block overflow-x-auto");
    expect(historyHtml).toContain("w-full text-left border-collapse");
    expect(historyHtml).toContain("Tanggal");
    expect(historyHtml).toContain("Sales");
    expect(historyHtml).toContain("Item");
    expect(historyHtml).toContain("lucide-search");
    expect(historyHtml).toContain("lucide-calendar-days");
    expect(historyHtml).toContain("lucide-truck");
    expect(historyHtml).not.toContain("Read-only");

    expect(posHtml).toContain('data-help-actual-page="pos"');
    expect(posHtml).toContain("flex flex-1 overflow-hidden");
    expect(posHtml).toContain("Produk");
    expect(posHtml).toContain("Layanan");
    expect(posHtml).toContain("Cari produk, SKU, atau barcode...");
    expect(posHtml).toContain("Stok tersedia");
    expect(posHtml).toContain("hidden lg:block w-[340px] flex-shrink-0");
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

  it("renders every registered visual target in its static template", () => {
    for (const [page, config] of Object.entries(HELP_VISUAL_PAGE_CONFIG)) {
      const html = renderToStaticMarkup(
        <VisualGuideMockup
          visual={{
            page: page as keyof typeof HELP_VISUAL_PAGE_CONFIG,
            target: config.primaryTarget,
            callout: `Panduan ${config.label}`,
          }}
          stepNumber={1}
          stepTitle={config.label}
        />,
      );

      for (const group of config.groups) {
        for (const target of group.targets) {
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
