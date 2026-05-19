"use client";

import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface HorizontalScrollProps {
  children: React.ReactNode;
  className?: string;
  showScrollIndicators?: boolean;
  scrollButtonClassName?: string;
  ariaLabel?: string;
  /**
   * When true (default), shows soft fade gradients on either edge to hint at
   * more content. Disable for designs that already provide their own fade.
   */
  showEdgeFades?: boolean;
}

const DRAG_THRESHOLD = 4;

/**
 * A horizontally-scrolling rail with:
 * - Native, momentum-friendly touch swiping (no hijacked touch handlers).
 * - Mouse drag-to-scroll on desktop using Pointer Events.
 * - Keyboard arrow-key navigation (Left/Right/Home/End).
 * - Optional chevron buttons that animate in on hover/focus.
 * - Edge fade gradients that mirror the scroll position so users always know
 *   there's more to see.
 *
 * The component never blocks page-level vertical scroll: vertical touch
 * gestures fall through to the parent because we only opt into horizontal
 * panning via `touch-action: pan-x`.
 */
export const HorizontalScroll = React.forwardRef<
  HTMLDivElement,
  HorizontalScrollProps
>(function HorizontalScroll(
  {
    children,
    className = "",
    showScrollIndicators = true,
    scrollButtonClassName = "",
    ariaLabel,
    showEdgeFades = true,
  },
  ref,
) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useImperativeHandle<HTMLDivElement | null, HTMLDivElement | null>(
    ref,
    () => scrollRef.current,
  );

  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const dragStateRef = useRef<{
    pointerId: number;
    startX: number;
    startScroll: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 1);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 1);
  }, []);

  useLayoutEffect(() => {
    updateScrollState();
  }, [children, updateScrollState]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateScrollState, { passive: true });
    window.addEventListener("resize", updateScrollState);

    let resizeObserver: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(updateScrollState);
      resizeObserver.observe(el);
    }

    return () => {
      el.removeEventListener("scroll", updateScrollState);
      window.removeEventListener("resize", updateScrollState);
      resizeObserver?.disconnect();
    };
  }, [updateScrollState]);

  const scrollByAmount = useCallback((direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    // Page by ~85% of the visible width so the user always keeps a sliver of
    // the previous content as anchor.
    const amount = Math.max(160, el.clientWidth * 0.85);
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }, []);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Only enable drag-to-scroll for mouse/pen. Touch is left to the browser
    // for native momentum scrolling.
    if (event.pointerType === "touch") return;
    if (event.button !== 0) return;
    const el = scrollRef.current;
    if (!el) return;

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScroll: el.scrollLeft,
      moved: false,
    };
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const el = scrollRef.current;
    if (!el) return;

    const delta = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(delta) < DRAG_THRESHOLD) return;

    if (!drag.moved) {
      drag.moved = true;
      setIsDragging(true);
      try {
        el.setPointerCapture(event.pointerId);
      } catch {
        /* setPointerCapture can throw if pointer was already released */
      }
    }

    el.scrollLeft = drag.startScroll - delta;
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const el = scrollRef.current;
    if (drag.moved) {
      suppressClickRef.current = true;
      // Clear the suppression flag on the next frame so genuine clicks aren't
      // dropped on subsequent interactions.
      window.requestAnimationFrame(() => {
        suppressClickRef.current = false;
      });
    }
    if (el && el.hasPointerCapture(event.pointerId)) {
      el.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsDragging(false);
  };

  const onClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      scrollByAmount("right");
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      scrollByAmount("left");
    } else if (event.key === "Home") {
      event.preventDefault();
      el.scrollTo({ left: 0, behavior: "smooth" });
    } else if (event.key === "End") {
      event.preventDefault();
      el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    }
  };

  return (
    <div className="relative group">
      {showEdgeFades && (
        <>
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-white via-white/80 to-transparent transition-opacity duration-200 ${
              canScrollLeft ? "opacity-100" : "opacity-0"
            }`}
          />
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-white via-white/80 to-transparent transition-opacity duration-200 ${
              canScrollRight ? "opacity-100" : "opacity-0"
            }`}
          />
        </>
      )}

      <div
        ref={scrollRef}
        role="group"
        aria-label={ariaLabel}
        tabIndex={0}
        className={`no-scrollbar flex items-center overflow-x-auto overflow-y-hidden scroll-smooth select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        } ${className}`}
        style={{
          touchAction: "pan-x",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
          scrollbarWidth: "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>

      {showScrollIndicators && (
        <>
          <button
            type="button"
            onClick={() => scrollByAmount("left")}
            disabled={!canScrollLeft}
            aria-label="Scroll left"
            className={`hidden md:flex absolute left-1 top-1/2 -translate-y-1/2 z-20 h-9 w-9 items-center justify-center rounded-full bg-white/95 border border-slate-200 shadow-md text-slate-600 backdrop-blur transition-all duration-200 hover:bg-white hover:text-slate-900 disabled:pointer-events-none disabled:opacity-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500/40 ${scrollButtonClassName}`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByAmount("right")}
            disabled={!canScrollRight}
            aria-label="Scroll right"
            className={`hidden md:flex absolute right-1 top-1/2 -translate-y-1/2 z-20 h-9 w-9 items-center justify-center rounded-full bg-white/95 border border-slate-200 shadow-md text-slate-600 backdrop-blur transition-all duration-200 hover:bg-white hover:text-slate-900 disabled:pointer-events-none disabled:opacity-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-blue-500/40 ${scrollButtonClassName}`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );
});
