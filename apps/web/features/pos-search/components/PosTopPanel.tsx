"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp, GripHorizontal } from "lucide-react";

const MIN_HEIGHT = 96;
const MAX_HEIGHT = 360;
const DEFAULT_HEIGHT = 176;
const clampHeight = (height: number) => Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, height));

export function PosTopPanel({ children }: { children: ReactNode }) {
  const contentId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; y: number; height: number } | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [height, setHeight] = useState<number | undefined>(undefined);

  const currentHeight = () => height ?? contentRef.current?.getBoundingClientRect().height ?? DEFAULT_HEIGHT;
  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragRef.current) return;
    event.preventDefault();
    dragRef.current = { pointerId: event.pointerId, y: event.clientY, height: currentHeight() };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resize = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    setHeight(clampHeight(drag.height + event.clientY - drag.y));
  };
  const stopResize = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const resizeWithKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    let nextHeight: number;
    switch (event.key) {
      case "ArrowUp": nextHeight = currentHeight() - 16; break;
      case "ArrowDown": nextHeight = currentHeight() + 16; break;
      case "Home": nextHeight = MIN_HEIGHT; break;
      case "End": nextHeight = MAX_HEIGHT; break;
      default: return;
    }
    event.preventDefault();
    setHeight(clampHeight(nextHeight));
  };

  return (
    <section aria-label="Panel Kasir" className="shrink-0 min-h-0 max-h-[50%] flex flex-col bg-white border-b border-surface-200">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 md:px-6 py-1 text-xs text-surface-500">
        <span className="font-medium">Panel Kasir</span>
        <div className="flex items-center gap-2">
          {expanded && height !== undefined && (
            <button type="button" aria-label="Kembalikan ukuran panel" onClick={() => setHeight(undefined)}
              className="rounded px-2 py-1 hover:bg-surface-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
              Ukuran awal
            </button>
          )}
          <button type="button" aria-expanded={expanded} aria-controls={contentId}
            onClick={() => setExpanded((value) => !value)}
            className="flex items-center gap-1 rounded px-2 py-1 font-semibold text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
            {expanded ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
            {expanded ? "Ringkas panel" : "Buka panel"}
          </button>
        </div>
      </div>
      <div id={contentId} ref={contentRef} hidden={!expanded} style={{ height }}
        className="min-h-0 overflow-y-auto overflow-x-hidden">
        {children}
      </div>
      {expanded && (
        <div role="separator" tabIndex={0} aria-label="Ubah tinggi panel dengan tombol panah atas atau bawah"
          aria-orientation="horizontal" aria-controls={contentId} aria-valuemin={MIN_HEIGHT} aria-valuemax={MAX_HEIGHT}
          aria-valuenow={Math.round(clampHeight(currentHeight()))}
          title="Tarik untuk mengubah tinggi panel. Gunakan panah atas/bawah, Home, atau End."
          onPointerDown={startResize} onPointerMove={resize} onPointerUp={stopResize} onPointerCancel={stopResize}
          onLostPointerCapture={() => { dragRef.current = null; }} onKeyDown={resizeWithKeyboard}
          className="flex h-4 shrink-0 cursor-row-resize touch-none select-none items-center justify-center text-surface-400 hover:bg-brand-50 hover:text-brand-600 focus-visible:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
          style={{ WebkitUserSelect: "none" }}>
          <GripHorizontal className="h-4 w-5" aria-hidden="true" />
        </div>
      )}
    </section>
  );
}
