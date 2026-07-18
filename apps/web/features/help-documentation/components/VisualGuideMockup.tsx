"use client";

import React from "react";

import {
  HELP_VISUAL_PAGE_CONFIG,
  getHelpVisualTargetLabel,
  isKnownHelpVisualTarget as isKnownTarget,
  type HelpStepVisual,
} from "./help-visual-registry";
import { AppShellPreview } from "./app-shell-preview/AppShellPreview";
import { PREVIEW_RENDERERS, resolvePreviewState } from "./app-shell-preview/preview-registry";

type VisualGuideMockupProps = {
  visual: HelpStepVisual;
  stepNumber: number;
  stepTitle: string;
  magnifierEnabled?: boolean;
};

export function isKnownHelpVisualTarget(visual: Pick<HelpStepVisual, "page" | "target">) {
  return isKnownTarget(visual);
}

const VisualGuideMockupComponent: React.FC<VisualGuideMockupProps> = ({
  visual,
  stepNumber,
  stepTitle,
  magnifierEnabled = false,
}) => {
  const config = HELP_VISUAL_PAGE_CONFIG[visual.page];
  if (!isKnownTarget(visual)) {
    return (
      <section
        data-help-guide-unavailable="true"
        aria-live="polite"
        className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-950"
      >
        <p className="text-xs font-bold uppercase tracking-wide text-amber-700">{config.label}</p>
        <h3 className="mt-1 text-base font-bold">{stepTitle}</h3>
        <p className="mt-2 text-sm leading-relaxed">
          Panduan ini sedang disesuaikan dengan tampilan terbaru. Ini bukan kesalahan Anda.
        </p>
        <p className="mt-2 text-xs text-amber-800">Tutup tampilan ini atau kembali ke daftar panduan untuk memilih topik lain.</p>
      </section>
    );
  }

  const activeTarget = visual.target;
  const activeLabel = getHelpVisualTargetLabel({ page: visual.page, target: activeTarget });
  const state = resolvePreviewState(visual.page, activeTarget);
  const renderPage = PREVIEW_RENDERERS[visual.page];
  const context = {
    page: visual.page,
    activeTarget,
    stepNumber,
    stepTitle,
    callout: visual.callout,
    state,
  };

  return (
    <section
      data-help-visual-mock={visual.page}
      aria-label={`Mock halaman ${config.label}`}
      className="space-y-3"
    >
      <AppShellPreview
        page={visual.page}
        activeNavId={state === "finance-report" ? "financial-report" : undefined}
        activeTarget={activeTarget}
        magnifierEnabled={magnifierEnabled}
      >
        {renderPage(context)}
      </AppShellPreview>

      <div
        data-help-animation="step-callout"
        className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-brand-900 transition-all duration-300 ease-out"
      >
        <div className="mb-1 flex items-center gap-2">
          <span
            data-help-callout-number={stepNumber}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white"
          >
            {stepNumber}
          </span>
          <p className="text-sm font-bold">{stepTitle}</p>
        </div>
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">{activeLabel}</span>
          <span aria-hidden="true"> {"->"} </span>
          <span className="font-semibold">Di aplikasi: </span>
          {visual.callout}
        </p>
      </div>
    </section>
  );
};

export const VisualGuideMockup = React.memo(VisualGuideMockupComponent);
