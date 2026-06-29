"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  BadgePercent,
  Boxes,
  CalendarCheck,
  Circle,
  ClipboardCheck,
  ClipboardList,
  ClipboardSignature,
  DollarSign,
  FileDown,
  FileSpreadsheet,
  History,
  Image,
  Kanban,
  ListPlus,
  MessageCircle,
  Package,
  PackagePlus,
  Pencil,
  Printer,
  Receipt,
  ShieldCheck,
  ShoppingCart,
  Store,
  TriangleAlert,
  Truck,
  UserPlus,
  Users,
  Wallet,
  WalletCards,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { AssistantWorkflowStepPayload } from "../types/assistant";

export type WorkflowStepperStep = AssistantWorkflowStepPayload & {
  icon?: React.ReactNode;
};

type WorkflowStepperProps = {
  steps: WorkflowStepperStep[];
  compact?: boolean;
  tone?: "light" | "dark";
};

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "badge-percent": BadgePercent,
  boxes: Boxes,
  "calendar-check": CalendarCheck,
  "clipboard-check": ClipboardCheck,
  "clipboard-list": ClipboardList,
  "clipboard-signature": ClipboardSignature,
  "dollar-sign": DollarSign,
  "file-down": FileDown,
  "file-spreadsheet": FileSpreadsheet,
  history: History,
  image: Image,
  kanban: Kanban,
  "list-plus": ListPlus,
  "message-circle": MessageCircle,
  package: Package,
  "package-plus": PackagePlus,
  pencil: Pencil,
  printer: Printer,
  receipt: Receipt,
  "shield-check": ShieldCheck,
  "shopping-cart": ShoppingCart,
  store: Store,
  "triangle-alert": TriangleAlert,
  truck: Truck,
  "user-plus": UserPlus,
  users: Users,
  wallet: Wallet,
  "wallet-cards": WalletCards,
};

function StepIcon({ step }: { step: WorkflowStepperStep }) {
  if (step.icon) return <>{step.icon}</>;
  const Icon = step.iconKey ? ICONS[step.iconKey] : undefined;
  const ResolvedIcon = Icon ?? Circle;
  return <ResolvedIcon className="h-5 w-5" aria-hidden="true" />;
}

export function WorkflowStepper({ steps, compact = false, tone = "light" }: WorkflowStepperProps) {
  const [activeStep, setActiveStep] = useState(0);
  const reducedMotion = useReducedMotion();
  const active = steps[activeStep] ?? steps[0];
  const isDark = tone === "dark";

  if (!steps.length) return null;

  return (
    <div
      data-workflow-stepper="true"
      className={compact ? "mt-3 space-y-3" : "flex flex-col gap-5 md:flex-row"}
    >
      <ol className={compact ? "relative ml-2 space-y-3 border-l border-surface-500/50" : "relative ml-4 max-w-sm flex-1 space-y-5 border-l-2 border-surface-200"}>
        {steps.map((step, index) => {
          const selected = activeStep === index;
          return (
            <motion.li
              key={step.id}
              className="relative pl-5"
              initial={reducedMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16, delay: reducedMotion ? 0 : index * 0.04 }}
            >
              <span
                className={`absolute -left-[9px] top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                  selected
                    ? "border-brand-500 bg-brand-500"
                    : isDark
                      ? "border-surface-400 bg-surface-800"
                      : "border-surface-300 bg-white"
                }`}
                aria-hidden="true"
              >
                {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
              </span>
              <button
                type="button"
                aria-current={selected ? "step" : undefined}
                aria-expanded={selected}
                onClick={() => setActiveStep(index)}
                className={`w-full rounded-md px-1 text-left text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400/60 ${
                  selected
                    ? isDark ? "text-brand-200" : "text-brand-700"
                    : isDark ? "text-surface-200 hover:text-white" : "text-surface-700 hover:text-surface-950"
                }`}
              >
                {step.title}
              </button>
            </motion.li>
          );
        })}
      </ol>

      <div className={compact ? "" : "flex-[2]"}>
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            initial={reducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducedMotion ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.16 }}
            className={`rounded-lg border p-4 ${
              isDark
                ? "border-surface-500/40 bg-surface-800/70 text-surface-100"
                : "border-surface-200 bg-surface-50 text-surface-900"
            }`}
          >
            <div className="mb-3 flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                isDark
                  ? "border-brand-400/30 bg-brand-400/10 text-brand-200"
                  : "border-brand-100 bg-white text-brand-600"
              }`}>
                <StepIcon step={active} />
              </div>
              <h4 className="text-sm font-bold">{active.title}</h4>
            </div>
            <p className={isDark ? "text-sm leading-relaxed text-surface-200" : "text-sm leading-relaxed text-surface-600"}>
              {active.description}
            </p>
            {active.route && active.actionLabel ? (
              <Link
                href={active.route}
                draggable={false}
                onPointerDownCapture={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
                className={`mt-4 inline-flex items-center rounded-md px-3 py-2 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400/60 ${
                  isDark
                    ? "bg-brand-500/20 text-brand-100 hover:bg-brand-500/30"
                    : "bg-brand-600 text-white hover:bg-brand-500"
                }`}
              >
                {active.actionLabel}
              </Link>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
