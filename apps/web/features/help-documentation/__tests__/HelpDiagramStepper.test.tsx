import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Package, Save } from "lucide-react";

import HelpDiagramStepper, { HelpVisualModal } from "../components/HelpDiagramStepper";

describe("HelpDiagramStepper", () => {
  it("uses ordered workflow semantics without marking previous selections complete", () => {
    const html = renderToStaticMarkup(
      <HelpDiagramStepper
        steps={[
          { title: "Buka katalog", description: "Masuk ke Produk.", icon: <Package /> },
          { title: "Simpan produk", description: "Klik Simpan.", icon: <Save /> },
        ]}
      />,
    );

    expect(html).toContain("<ol");
    expect(html).toContain('aria-current="step"');
    expect(html).not.toContain("data-completed");
    expect(html).not.toContain("lucide-check");
  });

  it("renders a read-only mock page with a highlighted numbered callout", () => {
    const html = renderToStaticMarkup(
      <HelpDiagramStepper
        guideId="owner-rbac"
        guideTitle="Mengelola Akses (RBAC)"
        steps={[
          {
            title: "Buka Pengaturan",
            description: "Masuk ke halaman pengaturan utama.",
            icon: <Package />,
            visual: {
              page: "settings",
              target: "settings-sidebar",
              callout: "Klik menu Pengaturan di sidebar kiri.",
            },
          },
          {
            title: "Buka Tab RBAC",
            description: "Klik tab RBAC.",
            icon: <Save />,
            visual: {
              page: "settings",
              target: "settings-rbac-tab",
              callout: "Klik tab RBAC di panel pengaturan.",
            },
          },
        ]}
      />,
    );

    expect(html).toContain('data-help-visual-mock="settings"');
    expect(html).toContain("Mock halaman Pengaturan");
    expect(html).toContain("RBAC");
    expect(html).toContain("Klik menu Pengaturan di sidebar kiri.");
    expect(html).toContain('data-help-callout-number="1"');
    expect(html).toContain('data-help-visual-mode="inline"');
  });

  it("marks the selected step with smooth transition hooks", () => {
    const html = renderToStaticMarkup(
      <HelpDiagramStepper
        steps={[
          { title: "Buka katalog", description: "Masuk ke Produk.", icon: <Package /> },
          { title: "Simpan produk", description: "Klik Simpan.", icon: <Save /> },
        ]}
      />,
    );

    expect(html).toContain('data-help-stepper-animation="smooth"');
    expect(html).toContain('data-help-step-animation="active"');
    expect(html).toContain('data-help-step-dot-animation="active"');
    expect(html).toContain("transition-all");
    expect(html).toContain("duration-300");
    expect(html).toContain("ease-out");
  });

  it("renders a zoomable preview button in inline mode that links to the modal view", () => {
    const html = renderToStaticMarkup(
      <HelpDiagramStepper
        steps={[
          {
            title: "Buka katalog",
            description: "Masuk ke Produk.",
            icon: <Package />,
            visual: {
              page: "products",
              target: "products-add-button",
              callout: "Tambah produk",
            },
          },
        ]}
      />,
    );

    expect(html).toContain('aria-label="Buka panduan visual layar penuh"');
    expect(html).toContain('title="Klik untuk memperbesar panduan visual"');
    expect(html).toContain('data-help-right-guide-canvas="full-width"');
    expect(html).toContain("Perbesar Tampilan");
    expect(html).not.toContain("max-w-md");
    expect(html).not.toContain("lg:max-w-lg");
  });

  it("renders navigation arrows and fraction indicator in the visual modal", () => {
    const step = {
      title: "Step Title",
      description: "Step Description",
      icon: <Package />,
      id: "step-id",
      visual: {
        page: "settings" as const,
        target: "settings-sidebar",
        callout: "Callout text",
      },
    };

    const mockOnPrev = () => {};
    const mockOnNext = () => {};

    const html = renderToStaticMarkup(
      <HelpVisualModal
        step={step}
        stepNumber={1}
        totalSteps={3}
        guideTitle="Guide Title"
        onClose={() => {}}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
      />,
    );

    expect(html).toContain("Step Title");
    expect(html).toContain("1 / 3");
    expect(html).toContain('aria-label="Langkah sebelumnya"');
    expect(html).toContain('aria-label="Langkah berikutnya"');
  });

  it("keeps the right-side guide aligned with frontend development guidelines", () => {
    const stepperSource = readFileSync(new URL("../components/HelpDiagramStepper.tsx", import.meta.url), "utf8");
    const visualSource = readFileSync(new URL("../components/VisualGuideMockup.tsx", import.meta.url), "utf8");

    expect(stepperSource).toContain("const HelpGuideVisualPanelComponent: React.FC<HelpGuideVisualPanelProps>");
    expect(stepperSource).toContain("const HelpGuideVisualPanel = React.memo(HelpGuideVisualPanelComponent)");
    expect(stepperSource).toContain("const handleStepSelect = useCallback");
    expect(stepperSource).toContain("const handleOpenActiveModal = useCallback");
    expect(stepperSource).toContain("const handlePreviousModalStep = useCallback");
    expect(stepperSource).toContain("const handleNextModalStep = useCallback");
    expect(stepperSource).not.toContain("onClick={() =>");

    expect(visualSource).toContain("const VisualGuideMockupComponent: React.FC<VisualGuideMockupProps>");
    expect(visualSource).toContain("export const VisualGuideMockup = React.memo(VisualGuideMockupComponent)");
    expect(visualSource).toContain('containerType: "inline-size"');
    expect(visualSource).toContain('transform: "scale(calc(100cqw / 1366))"');
    expect(visualSource).not.toContain("ResizeObserver");
  });
});
