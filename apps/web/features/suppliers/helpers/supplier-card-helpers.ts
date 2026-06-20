export type EmptyStateVariant = "no-suppliers" | "no-match";

export interface EmptyStateContent {
  title: string;
  description: string;
  ctaLabel: string;
}

export interface SupplierCardA11yProps {
  role: "button";
  tabIndex: 0;
}

export interface KpiAccent {
  bgClass: string;
  iconClass: string;
}

const EMPTY_STATE_CONTENT: Record<EmptyStateVariant, EmptyStateContent> = {
  "no-suppliers": {
    title: "Belum ada supplier",
    description:
      "Tambahkan supplier pertama untuk mulai mencatat pembelian dan restock.",
    ctaLabel: "Tambah Supplier",
  },
  "no-match": {
    title: "Tidak ada supplier cocok",
    description:
      "Ubah pencarian atau reset filter untuk melihat supplier lain.",
    ctaLabel: "Reset Filter",
  },
};

export function buildEmptyStateContent(
  variant: EmptyStateVariant,
): EmptyStateContent {
  return EMPTY_STATE_CONTENT[variant];
}

export function buildSupplierCardA11yProps(): SupplierCardA11yProps {
  return { role: "button", tabIndex: 0 };
}

export function buildSupplierCardKeyDown(
  handler: (event: React.KeyboardEvent<HTMLElement>) => void,
) {
  return (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    handler(event);
  };
}

export function isSupplierCardInteractiveTarget(target: EventTarget | null) {
  if (target === null || typeof target !== "object") return false;
  const element = target as Partial<HTMLElement> & {
    closest?: (selector: string) => unknown;
    dataset?: Record<string, string | undefined>;
  };
  if (typeof element.closest !== "function") return false;
  if (element.dataset?.cardStop === "true") return true;
  return Boolean(element.closest("button, a, input, select, textarea"));
}

export const KPI_ACCENTS: KpiAccent[] = [
  { bgClass: "bg-cyan-50", iconClass: "text-cyan-700" },
  { bgClass: "bg-emerald-50", iconClass: "text-emerald-700" },
  { bgClass: "bg-blue-50", iconClass: "text-blue-700" },
  { bgClass: "bg-amber-50", iconClass: "text-amber-700" },
];