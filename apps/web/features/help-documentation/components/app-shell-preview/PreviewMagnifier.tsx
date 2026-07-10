"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";

const DIAMETER = 184;
const ZOOM = 2;

type LensFrame = {
  active: boolean;
  height: number;
  left: number;
  pointX: number;
  pointY: number;
  top: number;
  translateX: number;
  translateY: number;
  width: number;
};

const idleFrame: LensFrame = {
  active: false,
  height: 0,
  left: 0,
  pointX: 0,
  pointY: 0,
  top: 0,
  translateX: 0,
  translateY: 0,
  width: 0,
};

export function calculateMagnifierFrame({
  width,
  height,
  pointX,
  pointY,
  diameter,
  zoom,
}: {
  width: number;
  height: number;
  pointX: number;
  pointY: number;
  diameter: number;
  zoom: number;
}) {
  const clampedX = Math.min(width, Math.max(0, pointX));
  const clampedY = Math.min(height, Math.max(0, pointY));
  const radius = diameter / 2;

  return {
    pointX: clampedX,
    pointY: clampedY,
    left: Math.min(Math.max(0, width - diameter), Math.max(0, clampedX - radius)),
    top: Math.min(Math.max(0, height - diameter), Math.max(0, clampedY - radius)),
    translateX: radius - clampedX * zoom,
    translateY: radius - clampedY * zoom,
  };
}

export function PreviewMagnifier({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const cloneRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const scrollRef = useRef({ left: 0, top: 0 });
  const [frame, setFrame] = useState<LensFrame>(idleFrame);

  const syncCloneScroll = useCallback(() => {
    const cloneViewport = cloneRef.current?.querySelector<HTMLElement>(
      '[data-help-page-scroll="both"]',
    );
    if (!cloneViewport) return;
    cloneViewport.scrollLeft = scrollRef.current.left;
    cloneViewport.scrollTop = scrollRef.current.top;
  }, []);

  useEffect(() => {
    if (!frame.active) return;
    syncCloneScroll();
  }, [frame.active, syncCloneScroll]);

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
  }, []);

  const hide = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setFrame(idleFrame);
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || (event.pointerType !== "mouse" && event.pointerType !== "pen")) return;
    if (typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches) return;

    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const geometry = calculateMagnifierFrame({
      width: rect.width,
      height: rect.height,
      pointX: event.clientX - rect.left,
      pointY: event.clientY - rect.top,
      diameter: DIAMETER,
      zoom: ZOOM,
    });
    const nextFrame: LensFrame = {
      active: true,
      width: rect.width,
      height: rect.height,
      ...geometry,
    };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setFrame(nextFrame);
      rafRef.current = null;
    });
  }, [enabled]);

  const handleScrollCapture = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.dataset.helpPageScroll !== "both") return;
    scrollRef.current = { left: target.scrollLeft, top: target.scrollTop };
    syncCloneScroll();
  }, [syncCloneScroll]);

  return (
    <div
      ref={hostRef}
      data-help-magnifier-enabled={enabled ? "true" : undefined}
      className="relative h-full w-full overflow-hidden"
      onPointerMove={handlePointerMove}
      onPointerLeave={hide}
      onPointerCancel={hide}
      onScrollCapture={handleScrollCapture}
    >
      {children}
      {enabled ? (
        <div
          data-help-magnifier-bubble="true"
          data-help-magnifier-zoom={ZOOM}
          data-help-magnifier-diameter={DIAMETER}
          aria-hidden="true"
          className="pointer-events-none absolute z-[70] overflow-hidden rounded-full border-4 border-white bg-surface-950 shadow-2xl transition-opacity duration-150 motion-reduce:transition-none"
          style={{
            width: DIAMETER,
            height: DIAMETER,
            left: frame.left,
            top: frame.top,
            opacity: frame.active ? 1 : 0,
          }}
        >
          {frame.active ? (
            <div
              ref={cloneRef}
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: frame.width,
                height: frame.height,
                transform: `translate(${frame.translateX}px, ${frame.translateY}px) scale(${ZOOM})`,
                transformOrigin: "0 0",
              }}
            >
              {children}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
