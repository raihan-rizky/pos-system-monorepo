export type ChangeKind = "feature" | "improvement" | "fix";
export type ChangeVisual = "tax" | "categories" | "units" | "quotation" | "stock-groups" | "changelog" | "printing" | "shopping" | "history-table" | "financial";

export interface ChangeEntry {
  id: string;
  /** Actual release date, YYYY-MM-DD in Asia/Jakarta. Never refresh to keep an entry recent. */
  date: string;
  /** Increment when an existing announcement needs to be shown again. */
  revision: number;
  title: string;
  summary: string;
  /** Direct copy for the weekly popup: title up to 40 characters, summary up to 85. */
  highlight: { title: string; summary: string };
  kind: ChangeKind;
  area: string;
  href: string;
  visual: ChangeVisual;
  screenshot?: { src: string; alt: string };
  steps: [{ title: string; detail: string }, { title: string; detail: string }, { title: string; detail: string }];
}
