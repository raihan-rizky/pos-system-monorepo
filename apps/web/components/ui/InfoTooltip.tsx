"use client";

import React from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

type TooltipPosition = { top: number; left: number };

const TOOLTIP_WIDTH = 256;
const TOOLTIP_GAP = 8;
const VIEWPORT_PADDING = 8;

export interface InfoTooltipProps {
  title: string;
  description: string;
}

export function InfoTooltip({ title, description }: InfoTooltipProps) {
  const [open, setOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [position, setPosition] = React.useState<TooltipPosition>({ top: 0, left: 0 });
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const tooltipRef = React.useRef<HTMLDivElement | null>(null);
  const tooltipId = React.useId();

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

  const handleToggle = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((prev) => !prev);
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Informasi ${title}`}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onClick={handleToggle}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-current opacity-60 hover:opacity-100 hover:bg-black/5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 transition-all duration-150"
      >
        <Info className="h-[14px] w-[14px]" aria-hidden="true" />
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
              zIndex: 100, // higher z-index to stay above modals
            }}
            className="rounded-xl border border-slate-200 bg-white p-3 text-left shadow-xl motion-safe:animate-in motion-safe:fade-in motion-safe:duration-150"
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-900">
              {title}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              {description}
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}
