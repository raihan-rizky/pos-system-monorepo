import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type LinkProps = {
  href: string;
  prefetch?: boolean;
  onMouseEnter?: () => void;
  children: ReactNode;
};

const { links, prefetch } = vi.hoisted(() => ({
  links: [] as LinkProps[],
  prefetch: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: (props: LinkProps) => {
    links.push(props);
    return <a href={props.href}>{props.children}</a>;
  },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/pos",
  useRouter: () => ({ prefetch, push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({ canAccess: () => true, role: "OWNER" }),
}));
vi.mock("@/hooks/useTransactions", () => ({
  usePendingTransactionCount: () => ({ data: 0 }),
  useUnpaidDebtTransactionCount: () => ({ data: 0 }),
}));
vi.mock("@/features/inventory-management/hooks/useInventorySummary", () => ({
  useInventorySummary: () => ({ data: { urgentCount: 0 } }),
}));
vi.mock("@/utils/supabase/client", () => ({ createClient: vi.fn() }));

import { Sidebar } from "@/components/Sidebar";

describe("Sidebar prefetch", () => {
  beforeEach(() => {
    links.length = 0;
    prefetch.mockClear();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("keeps navigation links without speculative requests in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    renderToStaticMarkup(<Sidebar />);

    expect(links.some((link) => link.href === "/products")).toBe(true);
    for (const link of links) {
      expect(link.prefetch).toBe(false);
      link.onMouseEnter?.();
    }
    expect(prefetch).not.toHaveBeenCalled();
  });

  it("preserves production prefetch when hovering a navigation link", () => {
    vi.stubEnv("NODE_ENV", "production");
    renderToStaticMarkup(<Sidebar />);

    const products = links.find((link) => link.href === "/products");
    expect(products?.prefetch).toBe(true);
    products?.onMouseEnter?.();
    expect(prefetch).toHaveBeenCalledWith("/products");
  });
});
