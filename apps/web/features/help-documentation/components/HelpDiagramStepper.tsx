"use client";

import React from "react";
import { WorkflowStepper } from "@/features/ai-assistant/components/WorkflowStepper";

export type Step = {
  title: string;
  description: string;
  icon: React.ReactNode;
};

interface HelpDiagramStepperProps {
  steps: Step[];
}

export default function HelpDiagramStepper({ steps }: HelpDiagramStepperProps) {
  return (
    <WorkflowStepper
      steps={steps.map((step, index) => ({
        id: `help-step-${index + 1}`,
        title: step.title,
        description: step.description,
        icon: step.icon,
      }))}
      tone="light"
    />
  );
}
