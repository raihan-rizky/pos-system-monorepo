"use client";

import React, { useState } from "react";
import { Check, ChevronRight } from "lucide-react";

export type Step = {
  title: string;
  description: string;
  icon: React.ReactNode;
};

interface HelpDiagramStepperProps {
  steps: Step[];
}

export default function HelpDiagramStepper({ steps }: HelpDiagramStepperProps) {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Stepper Navigation */}
      <div className="flex-1 max-w-sm">
        <div className="relative border-l-2 border-surface-200 ml-4 space-y-6">
          {steps.map((step, idx) => {
            const isActive = activeStep === idx;
            const isPast = activeStep > idx;

            return (
              <div
                key={idx}
                className="relative pl-6 cursor-pointer group"
                onClick={() => setActiveStep(idx)}
              >
                <div
                  className={`absolute -left-[11px] top-1 w-5 h-5 rounded-full flex items-center justify-center border-2 transition-colors duration-200 bg-white
                  ${
                    isActive
                      ? "border-brand-500 ring-4 ring-brand-100"
                      : isPast
                      ? "border-emerald-500 bg-emerald-500"
                      : "border-surface-300 group-hover:border-brand-400"
                  }`}
                >
                  {isPast && <Check className="w-3 h-3 text-white" />}
                  {!isPast && isActive && (
                    <div className="w-2 h-2 bg-brand-500 rounded-full" />
                  )}
                </div>
                
                <h3
                  className={`text-sm font-bold transition-colors ${
                    isActive ? "text-brand-700" : "text-surface-700"
                  }`}
                >
                  {step.title}
                </h3>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Step Content Diagram */}
      <div className="flex-[2] bg-surface-50 border border-surface-200 rounded-2xl p-6 min-h-[250px] flex flex-col justify-center items-center text-center">
        <div className="w-16 h-16 bg-white shadow-sm border border-surface-100 rounded-2xl flex items-center justify-center mb-4 text-brand-600">
          {steps[activeStep].icon}
        </div>
        <h4 className="text-lg font-bold text-surface-900 mb-2">
          {steps[activeStep].title}
        </h4>
        <p className="text-sm text-surface-600 max-w-md">
          {steps[activeStep].description}
        </p>
      </div>
    </div>
  );
}
