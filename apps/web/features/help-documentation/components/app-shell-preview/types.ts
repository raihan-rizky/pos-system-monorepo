import type { HelpStepVisual } from "../help-visual-registry";

export type PreviewPage = HelpStepVisual["page"];

export type PreviewContext = {
  page: PreviewPage;
  activeTarget: string;
  stepNumber: number;
  stepTitle: string;
  callout: string;
  state: string;
};

export type PreviewRenderer = (context: PreviewContext) => React.ReactNode;

