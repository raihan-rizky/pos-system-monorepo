import React from "react";

import { getHelpVisualTargetLabel } from "../help-visual-registry";
import type { PreviewContext } from "./types";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function GuideTarget({
  ctx,
  target,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & {
  ctx: PreviewContext;
  target: string;
}) {
  const active = ctx.activeTarget === target;
  const label = active
    ? getHelpVisualTargetLabel({ page: ctx.page, target })
    : "";
  const calloutId = `help-callout-${target}`;

  return (
    <div
      {...rest}
      data-help-target={target}
      data-help-target-active={active ? "true" : undefined}
      data-help-animation={active ? "active-target" : undefined}
      data-help-glow={active ? "step-target" : undefined}
      data-help-glow-animation={active ? "pulse" : undefined}
      aria-describedby={active ? calloutId : rest["aria-describedby"]}
      className={cx(
        "relative min-w-0 transition-all duration-300 ease-out",
        className,
        active &&
          "z-20 ring-2 ring-brand-500 ring-inset shadow-glow help-step-glow-animated",
      )}
    >
      {active ? (
        <>
          <span
            data-help-overlay-spotlight={target}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] ring-2 ring-brand-500 ring-offset-2 ring-offset-surface-950/25"
          />
          <div
            id={calloutId}
            data-help-overlay-target={target}
            data-help-overlay-animation="target-callout"
            data-help-overlay-glow="step-callout"
            data-help-overlay-glow-animation="pulse"
            className="pointer-events-none absolute right-1 top-1 z-30 flex max-w-[min(22rem,calc(100%-0.5rem))] items-start justify-end gap-1 transition-all duration-300 ease-out motion-safe:animate-pulse"
          >
            <span
              data-help-overlay-arrow={target}
              aria-hidden="true"
              className="mt-2 h-3 w-3 rotate-45 bg-brand-600 shadow-glow"
            />
            <span
              data-help-callout-number={ctx.stepNumber}
              data-help-callout-glow="step-number"
              data-help-callout-glow-animation="pulse"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white shadow-glow help-step-callout-glow-animated transition-all duration-300 ease-out"
            >
              {ctx.stepNumber}
            </span>
            <span className="max-w-64 rounded-xl bg-brand-600 px-2.5 py-1.5 text-[9px] font-bold leading-snug text-white shadow-glow help-step-callout-glow-animated">
              <span className="block">{label}</span>
              <span className="block font-medium text-brand-50">Di aplikasi: {ctx.callout}</span>
            </span>
          </div>
        </>
      ) : null}
      {children}
    </div>
  );
}
