"use client";

import React, { useRef, useState, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface HorizontalScrollProps {
  children: React.ReactNode;
  className?: string;
  showScrollIndicators?: boolean;
  scrollButtonClassName?: string;
}

export const HorizontalScroll = React.forwardRef<
  HTMLDivElement,
  HorizontalScrollProps
>((
  {
    children,
    className = "",
    showScrollIndicators = true,
    scrollButtonClassName = "",
  },
  ref
) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);
  const [scrollStart, setScrollStart] = useState(0);

  const checkScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener("scroll", checkScroll);
      window.addEventListener("resize", checkScroll);
      return () => {
        container.removeEventListener("scroll", checkScroll);
        window.removeEventListener("resize", checkScroll);
      };
    }
  }, []);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = 300;
      scrollContainerRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart(e.clientX);
    setScrollStart(scrollContainerRef.current?.scrollLeft || 0);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    if (scrollContainerRef.current) {
      const diff = e.clientX - dragStart;
      scrollContainerRef.current.scrollLeft = scrollStart - diff;
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setDragStart(e.touches[0].clientX);
    setScrollStart(scrollContainerRef.current?.scrollLeft || 0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    if (scrollContainerRef.current) {
      const diff = e.touches[0].clientX - dragStart;
      scrollContainerRef.current.scrollLeft = scrollStart - diff;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  return (
    <div className="relative group">
      <div
        ref={ref || scrollContainerRef}
        className={`flex items-center gap-2 overflow-x-auto scroll-smooth ${
          isDragging ? "cursor-grabbing" : "cursor-grab"
        } ${className}`}
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </div>

      {showScrollIndicators && (
        <>
          {canScrollLeft && (
            <button
              onClick={() => scroll("left")}
              className={`absolute left-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-r-lg bg-gradient-to-r from-white via-white to-transparent hover:from-slate-50 transition-all duration-200 opacity-0 group-hover:opacity-100 ${
                scrollButtonClassName
              }`}
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            </button>
          )}
          {canScrollRight && (
            <button
              onClick={() => scroll("right")}
              className={`absolute right-0 top-1/2 -translate-y-1/2 z-10 p-2 rounded-l-lg bg-gradient-to-l from-white via-white to-transparent hover:from-slate-50 transition-all duration-200 opacity-0 group-hover:opacity-100 ${
                scrollButtonClassName
              }`}
              aria-label="Scroll right"
            >
              <ChevronRight className="w-5 h-5 text-slate-600" />
            </button>
          )}
        </>
      )}
    </div>
  );
});

HorizontalScroll.displayName = "HorizontalScroll";
