"use client";

import React from "react";
import { createPortal } from "react-dom";

type Position = { top: number; left: number; arrowLeft: number; above: boolean };

export function ProductDescriptionTooltip({ description }: { description?: string | null }) {
  const text = description?.trim();
  const [open, setOpen] = React.useState(false);
  const [position, setPosition] = React.useState<Position | null>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerWasOpen = React.useRef(false);
  const hoveringTrigger = React.useRef(false);
  const hoveringTooltip = React.useRef(false);
  const tooltipId = React.useId();

  const cancelClose = React.useCallback(() => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);

  const show = () => {
    cancelClose();
    setOpen(true);
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => {
      if (document.activeElement !== triggerRef.current && !hoveringTrigger.current && !hoveringTooltip.current) setOpen(false);
    }, 150);
  };

  React.useEffect(() => cancelClose, [cancelClose]);

  React.useEffect(() => {
    if (!open || !text) {
      cancelClose();
      hoveringTrigger.current = false;
      hoveringTooltip.current = false;
      if (open && !text) setOpen(false);
    }
  }, [open, text, cancelClose]);

  React.useLayoutEffect(() => {
    if (!open || !text) return;
    const reposition = () => {
      if (!triggerRef.current || !tooltipRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const width = tooltipRef.current.getBoundingClientRect().width;
      const height = tooltipRef.current.getBoundingClientRect().height;
      const padding = 8;
      const gap = 8;
      const above = window.innerHeight - rect.bottom - gap < height && rect.top > window.innerHeight - rect.bottom;
      const left = Math.max(padding, Math.min(rect.left, window.innerWidth - width - padding));
      const top = Math.max(padding, Math.min(
        above ? rect.top - height - gap : rect.bottom + gap,
        window.innerHeight - height - padding,
      ));
      setPosition({
        top,
        left,
        above,
        arrowLeft: Math.max(16, Math.min(rect.left + rect.width / 2 - left, width - 16)),
      });
    };
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, text]);

  React.useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelClose();
        setOpen(false);
      }
    };
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !tooltipRef.current?.contains(target)) {
        cancelClose();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", dismiss);
    window.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("keydown", dismiss);
      window.removeEventListener("pointerdown", outside);
    };
  }, [open, cancelClose]);

  if (!text) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Deskripsi produk"
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") {
            hoveringTrigger.current = true;
            show();
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") {
            hoveringTrigger.current = false;
            scheduleClose();
          }
        }}
        onPointerDown={() => { pointerWasOpen.current = open; }}
        onFocus={show}
        onBlur={scheduleClose}
        onClick={(event) => {
          event.stopPropagation();
          cancelClose();
          setOpen(event.detail === 0 ? !open : !pointerWasOpen.current);
        }}
        className="mt-1 w-full rounded text-left text-xs leading-relaxed text-surface-600 cursor-help hover:text-surface-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <span className="line-clamp-2 whitespace-pre-line break-words">{text}</span>
      </button>
      {open && createPortal(
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          onPointerEnter={() => {
            hoveringTooltip.current = true;
            cancelClose();
          }}
          onPointerLeave={() => {
            hoveringTooltip.current = false;
            scheduleClose();
          }}
          onClick={(event) => event.stopPropagation()}
          style={{
            position: "fixed",
            width: "min(20rem, calc(100vw - 16px))",
            top: position?.top ?? 0,
            left: position?.left ?? 0,
            visibility: position ? "visible" : "hidden",
            zIndex: 100,
          }}
          className="rounded-xl border border-surface-200 bg-white text-left text-sm text-surface-900 shadow-lg"
        >
          <span
            aria-hidden="true"
            style={{ left: position?.arrowLeft ?? 16, ...(position?.above ? { bottom: -5 } : { top: -5 }) }}
            className={`absolute h-2 w-2 -translate-x-1/2 rotate-45 bg-white ${position?.above ? "border-b border-r" : "border-l border-t"} border-surface-200`}
          />
          <div className="max-h-[calc(100dvh-32px)] overflow-y-auto whitespace-pre-wrap break-words p-3 leading-relaxed [overflow-wrap:anywhere]">{text}</div>
        </div>,
        document.body,
      )}
    </>
  );
}
