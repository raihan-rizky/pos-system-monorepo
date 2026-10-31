"use client";

import { Maximize2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

export function AutoFitHistoryTable({ children }: { children: ReactNode }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const fitTable = useCallback(() => {
    const viewport = viewportRef.current;
    const content = contentRef.current;
    const table = content?.querySelector("table");
    if (!viewport || !content || !table || viewport.clientWidth === 0) return;

    // Measure the table at its natural size, including the current row actions.
    content.style.setProperty("zoom", "1");
    content.style.transform = "";
    content.style.width = "100%";
    viewport.style.height = "";

    const tableWidth = table.getBoundingClientRect().width;
    const viewportWidth = viewport.getBoundingClientRect().width;
    if (tableWidth <= 0 || viewportWidth <= 1) return;

    const scale = tableWidth <= viewportWidth ? 1 : (viewportWidth - 1) / tableWidth;
    if (typeof CSS !== "undefined" && CSS.supports("zoom", "1")) {
      content.style.setProperty("zoom", String(scale));
    } else {
      // Older browsers need a transformed wrapper and an explicit layout height.
      content.style.width = `${100 / scale}%`;
      content.style.transformOrigin = "top left";
      content.style.transform = `scale(${scale})`;
      viewport.style.height = `${Math.ceil(content.getBoundingClientRect().height)}px`;
    }
  }, []);

  useLayoutEffect(() => {
    fitTable();
  }, [children, fitTable]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const table = contentRef.current?.querySelector("table");
    if (!viewport || !table) return;

    let frame = 0;
    let active = true;
    const scheduleFit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitTable);
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleFit);
    observer?.observe(viewport);
    observer?.observe(table);
    window.addEventListener("resize", scheduleFit);
    document.fonts?.ready.then(() => {
      if (active) scheduleFit();
    });

    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleFit);
    };
  }, [fitTable]);

  return (
    <div className="hidden min-w-0 md:block">
      <div className="flex justify-end border-b border-surface-100 px-4 py-2">
        <button
          type="button"
          onClick={fitTable}
          aria-label="Sesuaikan lebar tabel"
          title="Sesuaikan lebar tabel"
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-surface-600 hover:bg-surface-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
          <span>Sesuaikan tabel</span>
        </button>
      </div>
      <div ref={viewportRef} className="w-full overflow-hidden">
        <div ref={contentRef} className="w-full">{children}</div>
      </div>
    </div>
  );
}
