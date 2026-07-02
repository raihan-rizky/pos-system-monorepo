import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ProductImportProgressModal } from "../ProductImportProgressModal";

vi.mock("../../hooks/useProductImport", () => ({
  useCancelProductImportJob: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
  useRetryProductImportJob: () => ({
    isPending: false,
    mutateAsync: vi.fn(),
  }),
}));

vi.mock("@pos/ui", () => ({
  Button: ({ children }: { children: ReactNode }) => <button>{children}</button>,
  Modal: ({
    children,
    open,
    title,
  }: {
    children: ReactNode;
    open: boolean;
    title: string;
  }) => (open ? <section><h1>{title}</h1>{children}</section> : null),
}));

describe("ProductImportProgressModal", () => {
  it("lets users retry a pending import job after an infrastructure error", () => {
    const html = renderToStaticMarkup(
      <ProductImportProgressModal
        open
        job={{
          id: "job-1",
          batchOperationId: "batch-1",
          status: "PENDING",
          totalRows: 10,
          processedRows: 0,
          successRows: 0,
          failedRows: 0,
          skippedRows: 0,
          lastError: "Koneksi database sementara terganggu. Silakan coba lagi.",
        }}
        isRefreshing={false}
        onRefresh={() => Promise.resolve()}
        onClose={() => undefined}
      />,
    );

    expect(html).toContain("Koneksi database sementara terganggu");
    expect(html).toContain("Coba Lagi");
  });
});
