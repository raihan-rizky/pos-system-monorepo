import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { SupplierCodeImportDrawer } from "../SupplierCodeImportDrawer";

vi.mock("@pos/ui", () => ({
  Modal: ({ children, open, title }: { children: ReactNode; open: boolean; title: string }) =>
    open ? <section><h1>{title}</h1>{children}</section> : null,
}));

describe("SupplierCodeImportDrawer", () => {
  it("menjelaskan format impor kode supplier massal dalam bahasa Indonesia", () => {
    const html = renderToStaticMarkup(
      <SupplierCodeImportDrawer open onClose={() => undefined} onCompleted={() => undefined} />,
    );

    expect(html).toContain("Impor Kode Supplier Massal");
    expect(html).toContain("SKU");
    expect(html).toContain("Kode Supplier");
    expect(html).toContain("Unduh Template CSV");
    expect(html.toLowerCase()).not.toContain("bulk");
  });
});
