import React from "react";
import type { LucideIcon } from "lucide-react";
import { X } from "lucide-react";

import { GuideTarget, cx } from "./GuideTarget";
import type { PreviewContext } from "./types";

export function PreviewPageRoot({
  ctx,
  className,
  children,
}: {
  ctx: PreviewContext;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-help-actual-page={ctx.page}
      data-help-fidelity-page={ctx.page}
      data-help-preview-state={ctx.state}
      data-help-page-viewport="clipped"
      className={cx(
        "relative min-h-[768px] min-w-[1290px] bg-surface-50 text-surface-900",
        className,
      )}
    >
      {children}
    </section>
  );
}

export function PreviewHeader({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  tone = "slate",
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  icon?: LucideIcon;
  tone?: "slate" | "brand" | "violet" | "emerald";
  actions?: React.ReactNode;
}) {
  const tones = {
    slate: "from-slate-600 to-slate-800",
    brand: "from-brand-500 to-brand-700",
    violet: "from-violet-500 to-indigo-600",
    emerald: "from-emerald-500 to-teal-700",
  };

  return (
    <header className="flex items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-brand-700">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-surface-950">
          {Icon ? (
            <span className={cx("flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm", tones[tone])}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          ) : null}
          {title}
        </h1>
        <p className="mt-1 max-w-3xl text-sm font-medium text-surface-500">{subtitle}</p>
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  );
}

export function PreviewButton({
  ctx,
  target,
  children,
  icon: Icon,
  tone = "light",
  className,
}: {
  ctx: PreviewContext;
  target: string;
  children: React.ReactNode;
  icon?: LucideIcon;
  tone?: "light" | "dark" | "brand" | "danger" | "success";
  className?: string;
}) {
  const tones = {
    light: "border-surface-200 bg-white text-surface-700",
    dark: "border-slate-900 bg-slate-900 text-white",
    brand: "border-brand-600 bg-brand-600 text-white",
    danger: "border-red-200 bg-red-50 text-red-700",
    success: "border-emerald-600 bg-emerald-600 text-white",
  };

  return (
    <GuideTarget
      ctx={ctx}
      target={target}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-xs font-bold shadow-sm",
        tones[tone],
        className,
      )}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      <span>{children}</span>
    </GuideTarget>
  );
}

export function PreviewTab({
  ctx,
  target,
  children,
  active,
  icon: Icon,
}: {
  ctx: PreviewContext;
  target: string;
  children: React.ReactNode;
  active: boolean;
  icon?: LucideIcon;
}) {
  return (
    <GuideTarget
      ctx={ctx}
      target={target}
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold",
        active ? "bg-white text-surface-950 shadow-sm" : "text-surface-500",
      )}
    >
      {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
      {children}
    </GuideTarget>
  );
}

export function PreviewMetric({
  label,
  value,
  tone = "slate",
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: "slate" | "blue" | "emerald" | "amber" | "red" | "violet";
  icon?: LucideIcon;
}) {
  const tones = {
    slate: "bg-slate-50 text-slate-700 ring-slate-100",
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    red: "bg-red-50 text-red-700 ring-red-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
  };

  return (
    <article className="rounded-2xl border border-white bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-surface-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-surface-950">{value}</p>
        </div>
        {Icon ? (
          <span className={cx("flex h-10 w-10 items-center justify-center rounded-xl ring-1", tones[tone])}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        ) : null}
      </div>
    </article>
  );
}

export function PreviewModal({
  ctx,
  target,
  title,
  children,
  width = "max-w-xl",
}: {
  ctx: PreviewContext;
  target: string;
  title: string;
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center overflow-hidden bg-surface-950/45 p-8 backdrop-blur-[2px]">
      <GuideTarget
        ctx={ctx}
        target={target}
        className={cx("max-h-[680px] w-full overflow-auto rounded-2xl border border-surface-200 bg-white shadow-2xl", width)}
      >
        <div className="flex items-center justify-between border-b border-surface-100 px-5 py-4">
          <h2 className="text-lg font-black text-surface-950">{title}</h2>
          <span className="rounded-lg p-2 text-surface-400"><X className="h-4 w-4" /></span>
        </div>
        <div className="p-5">{children}</div>
      </GuideTarget>
    </div>
  );
}

export function PreviewField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-bold text-surface-600">{label}</span>
      <span className="block min-h-10 truncate rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 text-xs text-surface-700">
        {value}
      </span>
    </label>
  );
}

