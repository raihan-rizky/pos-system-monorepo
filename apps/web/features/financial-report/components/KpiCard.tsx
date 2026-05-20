"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

export type KpiTone = "brand" | "success" | "warning" | "danger" | "neutral";

export type KpiInfoText = {
  title: string;
  description: string;
  formula?: string;
};

interface KpiCardProps {
  label: string;
  value: string;
  hint?: string;
  tone?: KpiTone;
  icon: React.ReactNode;
  loading?: boolean;
  infoText?: KpiInfoText;
}

const toneStyles: Record<
  KpiTone,
  { value: string; iconBg: string; iconText: string; accent: string }
> = {
  brand: {
    value: "text-surface-900",
    iconBg: "bg-brand-50",
    iconText: "text-brand-600",
    accent: "from-brand-500/10 via-transparent",
  },
  success: {
    value: "text-emerald-700",
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    accent: "from-emerald-500/10 via-transparent",
  },
  warning: {
    value: "text-amber-700",
    iconBg: "bg-amber-50",
    iconText: "text-amber-600",
    accent: "from-amber-500/10 via-transparent",
  },
  danger: {
    value: "text-red-600",
    iconBg: "bg-red-50",
    iconText: "text-red-600",
    accent: "from-red-500/10 via-transparent",
  },
  neutral: {
    value: "text-surface-900",
    iconBg: "bg-surface-100",
    iconText: "text-surface-600",
    accent: "from-surface-300/20 via-transparent",
  },
};

type TooltipPosition = { top: number; left: number };

const TOOLTIP_WIDTH = 256; // matches w-64
const TOOLTIP_GAP = 8;
const VIEWPORT_PADDING = 8;

function useInfoTooltip() {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [position, setPosition] = React.useState<TooltipPosition>({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const tooltipRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_PADDING),
      viewportWidth - TOOLTIP_WIDTH - VIEWPORT_PADDING,
    );
    setPosition({
      top: rect.bottom + TOOLTIP_GAP,
      left,
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    updatePosition();

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    function handlePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (tooltipRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleReposition() {
      updatePosition();
    }

    window.addEventListener("keydown", handleKey);
    window.addEventListener("pointerdown", handlePointer);
    window.addEventListener("scroll", handleReposition, true);
    window.addEventListener("resize", handleReposition);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("scroll", handleReposition, true);
      window.removeEventListener("resize", handleReposition);
    };
  }, [open, updatePosition]);

  return { open, setOpen, position, mounted, triggerRef, tooltipRef };
}

export const KpiCard: React.FC<KpiCardProps> = React.memo(function KpiCard({
  label,
  value,
  hint,
  tone = "brand",
  icon,
  loading,
  infoText,
}) {
  const style = toneStyles[tone];
  const { open, setOpen, position, mounted, triggerRef, tooltipRef } =
    useInfoTooltip();
  const tooltipId = React.useId();
  const handleToggle = React.useCallback(() => {
    setOpen((prev) => !prev);
  }, [setOpen]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-surface-200 bg-white p-4 md:p-5 shadow-sm">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b ${style.accent} to-transparent`}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-surface-500">
              {label}
            </p>
            {infoText && (
              <>
                <button
                  ref={triggerRef}
                  type="button"
                  aria-label={`Cara hitung ${infoText.title}`}
                  aria-describedby={open ? tooltipId : undefined}
                  aria-expanded={open}
                  onClick={handleToggle}
                  className="inline-flex h-6 w-6 -m-1 items-center justify-center rounded-full text-surface-400 hover:text-surface-700 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 transition-colors duration-150"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {open && mounted &&
                  createPortal(
                    <div
                      ref={tooltipRef}
                      id={tooltipId}
                      role="tooltip"
                      style={{
                        position: "fixed",
                        top: position.top,
                        left: position.left,
                        width: TOOLTIP_WIDTH,
                        zIndex: 50,
                      }}
                      className="rounded-xl border border-surface-200 bg-white p-3 text-left shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
                    >
                      <p className="text-[11px] font-bold uppercase tracking-wider text-surface-900">
                        {infoText.title}
                      </p>
                      <p className="mt-1.5 text-xs leading-relaxed text-surface-600">
                        {infoText.description}
                      </p>
                      {infoText.formula && (
                        <p className="mt-2 rounded-md bg-surface-50 px-2 py-1.5 font-mono text-[11px] text-surface-700">
                          Rumus: {infoText.formula}
                        </p>
                      )}
                    </div>,
                    document.body,
                  )}
              </>
            )}
          </div>
          {loading ? (
            <div className="mt-2 h-7 w-28 rounded-md bg-surface-100 animate-pulse" />
          ) : (
            <p
              className={`mt-1.5 text-xl md:text-2xl font-bold tabular-nums ${style.value}`}
            >
              {value}
            </p>
          )}
          {loading ? (
            <div className="mt-2 h-3 w-20 rounded bg-surface-100 animate-pulse" />
          ) : hint ? (
            <p className="mt-1 text-[11px] text-surface-500 truncate">{hint}</p>
          ) : null}
        </div>
        <span
          aria-hidden="true"
          className={`shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-xl ${style.iconBg} ${style.iconText}`}
        >
          {icon}
        </span>
      </div>
    </div>
  );
});

export default KpiCard;
