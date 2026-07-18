"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { Role } from "@/features/rbac/helpers/rbac-core";
import { VisualGuideMockup } from "./VisualGuideMockup";
import {
  resolveHelpStepVisual,
  type HelpStepVisual,
} from "./help-visual-registry";

export type Step = {
  title: string;
  description: string;
  icon: React.ReactNode;
  visual?: HelpStepVisual;
};

type VisualMode = "inline" | "modal";

type ResolvedStep = Step & {
  id: string;
  visual: HelpStepVisual;
};

interface HelpDiagramStepperProps {
  steps: Step[];
  guideId?: string;
  guideTitle?: string;
  role?: Role | "AI_ASSISTANT";
  visualMode?: VisualMode;
}

interface HelpVisualModalProps {
  step: ResolvedStep;
  stepNumber: number;
  totalSteps: number;
  guideTitle?: string;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

interface HelpStepListItemProps {
  step: ResolvedStep;
  index: number;
  selected: boolean;
  mode: VisualMode;
  onSelect: (index: number) => void;
}

interface HelpGuideVisualPanelProps {
  mode: VisualMode;
  active: ResolvedStep;
  activeStep: number;
  onOpenActiveModal: () => void;
}

const TOUCH_ZOOM_MIN = 1;
const TOUCH_ZOOM_MAX = 3;

function TouchZoomViewport({ resetKey, children }: { resetKey: string; children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef({ distance: 0, scale: 1, x: 0, y: 0 });
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });

  const clampTransform = useCallback((scale: number, x: number, y: number) => {
    const rect = hostRef.current?.getBoundingClientRect();
    if (!rect) return { scale, x: 0, y: 0 };
    const maxX = Math.max(0, (rect.width * (scale - 1)) / 2);
    const maxY = Math.max(0, (rect.height * (scale - 1)) / 2);
    return {
      scale,
      x: Math.min(maxX, Math.max(-maxX, x)),
      y: Math.min(maxY, Math.max(-maxY, y)),
    };
  }, []);

  const reset = useCallback(() => {
    pointersRef.current.clear();
    gestureRef.current = { distance: 0, scale: 1, x: 0, y: 0 };
    setTransform({ scale: 1, x: 0, y: 0 });
  }, []);

  useEffect(reset, [reset, resetKey]);
  useEffect(() => {
    window.addEventListener("resize", reset);
    window.addEventListener("orientationchange", reset);
    return () => {
      window.removeEventListener("resize", reset);
      window.removeEventListener("orientationchange", reset);
    };
  }, [reset]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(pointersRef.current.values());
    if (points.length === 2) {
      gestureRef.current = {
        distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y),
        scale: transform.scale,
        x: transform.x,
        y: transform.y,
      };
    }
  }, [transform]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "touch" || !pointersRef.current.has(event.pointerId)) return;
    const previous = pointersRef.current.get(event.pointerId)!;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = Array.from(pointersRef.current.values());

    if (points.length >= 2 && gestureRef.current.distance > 0) {
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const scale = Math.min(
        TOUCH_ZOOM_MAX,
        Math.max(TOUCH_ZOOM_MIN, gestureRef.current.scale * (distance / gestureRef.current.distance)),
      );
      setTransform(clampTransform(scale, gestureRef.current.x, gestureRef.current.y));
      return;
    }

    if (points.length === 1 && transform.scale > TOUCH_ZOOM_MIN) {
      setTransform(clampTransform(
        transform.scale,
        transform.x + event.clientX - previous.x,
        transform.y + event.clientY - previous.y,
      ));
    }
  }, [clampTransform, transform]);

  const releasePointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) {
      gestureRef.current = { distance: 0, scale: transform.scale, x: transform.x, y: transform.y };
    }
  }, [transform]);

  return (
    <div
      ref={hostRef}
      data-help-touch-zoom="true"
      data-help-touch-zoom-min={TOUCH_ZOOM_MIN}
      data-help-touch-zoom-max={TOUCH_ZOOM_MAX}
      className="relative min-h-full overflow-hidden md:overflow-visible"
      style={{ touchAction: "none" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={releasePointer}
      onPointerCancel={releasePointer}
    >
      <div
        className="origin-center transition-transform duration-150 motion-reduce:transition-none"
        style={{ transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})` }}
      >
        {children}
      </div>
    </div>
  );
}

export const HelpVisualModal: React.FC<HelpVisualModalProps> = ({
  step,
  stepNumber,
  totalSteps,
  guideTitle,
  onClose,
  onPrev,
  onNext,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);

  const handleGlobalKeyDown = useCallback((event: KeyboardEvent): void => {
    if (event.key === "Escape") onClose();
    if (event.key === "ArrowLeft" && onPrev) onPrev();
    if (event.key === "ArrowRight" && onNext) onNext();
  }, [onClose, onPrev, onNext]);

  useEffect((): (() => void) => {
    const previousActiveElement = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    window.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previousActiveElement?.focus();
    };
  }, [handleGlobalKeyDown]);

  const trapFocus = useCallback((event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== "Tab") return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-950/60 p-4 backdrop-blur-sm">
      {onPrev ? (
        <button
          type="button"
          onClick={onPrev}
          className="absolute left-4 top-1/2 z-50 flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/40 text-white shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-black/60 active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-500 lg:left-8"
          aria-label="Langkah sebelumnya"
        >
          <ChevronLeft className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
        </button>
      ) : null}

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${guideTitle ? `${guideTitle}: ` : ""}${step.title}`}
        tabIndex={-1}
        onKeyDown={trapFocus}
        className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-surface-200 p-4 shrink-0">
          <div>
            {guideTitle ? <p className="text-xs font-semibold text-brand-600">{guideTitle}</p> : null}
            <h3 className="flex items-center gap-2 text-base font-bold text-surface-900">
              <span>{step.title}</span>
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                {stepNumber} / {totalSteps}
              </span>
            </h3>
            <p className="mt-1 text-sm text-surface-600">{step.description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-surface-200 px-3 py-2 text-sm font-semibold text-surface-700 hover:bg-surface-50 shrink-0"
          >
            Tutup
          </button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto">
          <TouchZoomViewport resetKey={step.id}>
            <VisualGuideMockup
              visual={step.visual}
              stepNumber={stepNumber}
              stepTitle={step.title}
              magnifierEnabled
            />
          </TouchZoomViewport>
        </div>
      </div>

      {onNext ? (
        <button
          type="button"
          onClick={onNext}
          className="absolute right-4 top-1/2 z-50 flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/40 text-white shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-black/60 active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand-500 lg:right-8"
          aria-label="Langkah berikutnya"
        >
          <ChevronRight className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
};

const HelpStepListItemComponent: React.FC<HelpStepListItemProps> = ({
  step,
  index,
  selected,
  mode,
  onSelect,
}) => {
  const handleSelect = useCallback((): void => {
    onSelect(index);
  }, [index, onSelect]);

  return (
    <li
      data-help-step-animation={selected ? "active" : "idle"}
      className="relative pl-5 transition-all duration-300 ease-out"
    >
      <span
        data-help-step-dot-animation={selected ? "active" : "idle"}
        className={`absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 transition-all duration-300 ease-out ${
          selected ? "border-brand-500 bg-brand-500" : "border-surface-300 bg-white"
        }`}
        aria-hidden="true"
      >
        {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white motion-safe:animate-pulse" /> : null}
      </span>
      <button
        type="button"
        aria-current={selected ? "step" : undefined}
        aria-expanded={selected}
        data-help-visual-modal-trigger={mode === "modal" ? "true" : undefined}
        onClick={handleSelect}
        className={`w-full rounded-md px-1 text-left text-sm font-semibold transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-brand-400/60 ${
          selected ? "text-brand-700" : "text-surface-700 hover:text-surface-950"
        }`}
      >
        {step.title}
        <span className="sr-only">. {step.description}</span>
      </button>
    </li>
  );
};

const HelpStepListItem = React.memo(HelpStepListItemComponent);

const HelpGuideVisualPanelComponent: React.FC<HelpGuideVisualPanelProps> = ({
  mode,
  active,
  activeStep,
  onOpenActiveModal,
}) => {
  if (mode === "inline") {
    return (
      <div
        data-help-right-guide="inline"
        data-frontend-guidelines="memoized-panel"
        className="flex-[2] min-w-0"
      >
        <div data-help-right-guide-canvas="full-width" className="w-full min-w-0">
          <button
            type="button"
            onClick={onOpenActiveModal}
            className="group relative block w-full cursor-zoom-in overflow-hidden rounded-xl transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500"
            title="Klik untuk memperbesar panduan visual"
            aria-label="Buka panduan visual layar penuh"
          >
            <div className="pointer-events-none select-none" aria-hidden="true">
              <VisualGuideMockup
                visual={active.visual}
                stepNumber={activeStep + 1}
                stepTitle={active.title}
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-surface-950/0 transition-colors group-hover:bg-surface-950/35">
              <div className="flex translate-y-2 items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-1.5 text-xs font-bold text-white opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100">
                <Search className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                Perbesar Tampilan
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-help-right-guide="modal-prompt"
      data-frontend-guidelines="memoized-panel"
      className="flex-[2] min-w-0"
    >
      <div className="rounded-lg border border-surface-200 bg-surface-50 p-4 text-surface-900">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand-100 bg-white text-brand-600">
            {active.icon}
          </div>
          <h4 className="text-sm font-bold">{active.title}</h4>
        </div>
        <p className="text-sm leading-relaxed text-surface-600">{active.description}</p>
        <p className="mt-3 text-xs font-semibold text-brand-700">
          Klik salah satu langkah untuk membuka panduan visual.
        </p>
      </div>
    </div>
  );
};

const HelpGuideVisualPanel = React.memo(HelpGuideVisualPanelComponent);

const HelpDiagramStepper: React.FC<HelpDiagramStepperProps> = ({
  steps,
  guideId = "help-guide",
  guideTitle,
  role,
  visualMode,
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [modalStep, setModalStep] = useState<number | null>(null);
  const mode = visualMode ?? (role === "AI_ASSISTANT" ? "modal" : "inline");
  const resolvedSteps = useMemo<ResolvedStep[]>(() => (
    steps.map((step, index) => ({
      ...step,
      id: `${guideId}-help-step-${index + 1}`,
      visual: resolveHelpStepVisual({
        role,
        guideId,
        guideTitle,
        step,
        stepIndex: index,
      }),
    }))
  ), [guideId, guideTitle, role, steps]);

  const active = resolvedSteps[activeStep] ?? resolvedSteps[0];
  const modal = modalStep === null ? null : resolvedSteps[modalStep];
  const canGoToPreviousModalStep = modalStep !== null && modalStep > 0;
  const canGoToNextModalStep = modalStep !== null && modalStep < resolvedSteps.length - 1;

  const handleStepSelect = useCallback((index: number): void => {
    setActiveStep(index);
    if (mode === "modal") setModalStep(index);
  }, [mode]);

  const handleOpenActiveModal = useCallback((): void => {
    setModalStep(activeStep);
  }, [activeStep]);

  const handleCloseModal = useCallback((): void => {
    setModalStep(null);
  }, []);

  const handlePreviousModalStep = useCallback((): void => {
    setModalStep((current) => {
      if (current === null || current <= 0) return current;

      const previous = current - 1;
      setActiveStep(previous);
      return previous;
    });
  }, []);

  const handleNextModalStep = useCallback((): void => {
    setModalStep((current) => {
      if (current === null || current >= resolvedSteps.length - 1) return current;

      const next = current + 1;
      setActiveStep(next);
      return next;
    });
  }, [resolvedSteps.length]);

  if (!resolvedSteps.length || !active) return null;

  return (
    <div
      data-workflow-stepper="true"
      data-help-visual-mode={mode}
      data-help-stepper-animation="smooth"
      className="flex flex-col gap-5 transition-all duration-300 ease-out md:flex-row"
    >
      <ol className="relative ml-4 max-w-sm flex-1 space-y-5 border-l-2 border-surface-200">
        {resolvedSteps.map((step, index) => (
          <HelpStepListItem
            key={step.id}
            step={step}
            index={index}
            selected={activeStep === index}
            mode={mode}
            onSelect={handleStepSelect}
          />
        ))}
      </ol>

      <HelpGuideVisualPanel
        mode={mode}
        active={active}
        activeStep={activeStep}
        onOpenActiveModal={handleOpenActiveModal}
      />

      {modal ? (
        <HelpVisualModal
          step={modal}
          stepNumber={modalStep! + 1}
          totalSteps={resolvedSteps.length}
          guideTitle={guideTitle}
          onClose={handleCloseModal}
          onPrev={canGoToPreviousModalStep ? handlePreviousModalStep : undefined}
          onNext={canGoToNextModalStep ? handleNextModalStep : undefined}
        />
      ) : null}
    </div>
  );
};

export default HelpDiagramStepper;
