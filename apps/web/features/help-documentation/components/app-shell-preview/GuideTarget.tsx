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

  return (
    <div
      {...rest}
      data-help-target={target}
      data-help-target-active={active ? "true" : undefined}
      data-help-animation={active ? "active-target" : undefined}
      data-help-glow={active ? "step-target" : undefined}
      data-help-glow-animation={active ? "pulse" : undefined}
      className={cx(
        "relative min-w-0 transition-all duration-300 ease-out",
        className,
        active &&
          "z-20 ring-2 ring-brand-500 ring-inset shadow-glow help-step-glow-animated",
      )}
    >
      {active ? (
        <div
          data-help-overlay-target={target}
          data-help-overlay-animation="target-callout"
          data-help-overlay-glow="step-callout"
          data-help-overlay-glow-animation="pulse"
          className="pointer-events-none absolute right-1 top-1 z-30 flex max-w-[calc(100%-0.5rem)] items-center justify-end gap-1 overflow-hidden transition-all duration-300 ease-out motion-safe:animate-pulse"
        >
          <span
            data-help-callout-number={ctx.stepNumber}
            data-help-callout-glow="step-number"
            data-help-callout-glow-animation="pulse"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white shadow-glow help-step-callout-glow-animated transition-all duration-300 ease-out"
          >
            {ctx.stepNumber}
          </span>
          <span className="max-w-44 truncate rounded-full bg-brand-600 px-2 py-1 text-[9px] font-bold text-white shadow-glow help-step-callout-glow-animated">
            {label}
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
