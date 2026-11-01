import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { BulkStockImportJobResponse } from "../../hooks/useBulkStockImport";

vi.mock("@pos/ui", async (importOriginal) => ({
  ...await importOriginal<object>(),
  Modal: ({ children, open }: { children: ReactNode; open: boolean }) => open ? <section>{children}</section> : null,
}));

const runningJob: BulkStockImportJobResponse = {
  id: "job-1", status: "RUNNING", phase: "UPDATING_STOCK", totalRows: 10,
  processedRows: 4, successRows: 0, failedRows: 0, result: null, errorMessage: null,
};

async function renderJob(job: BulkStockImportJobResponse) {
  const modulePath = "../BulkStockImportProgressModal";
  const module = await import(modulePath).catch(() => null);
  const Component = module?.BulkStockImportProgressModal;
  return Component ? renderToStaticMarkup(<Component open job={job} isRefreshing={false}
    onRefresh={async () => undefined} onClose={() => undefined} />) : "";
}

describe("BulkStockImportProgressModal", () => {
  it("shows an independently recovered job without requiring an uploaded file or preview", async () => {
    const html = await renderJob(runningJob);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain("40%");
    expect(html).toContain("Muat ulang");
  });

  it("explains an import that became unchanged before commit without claiming stock was updated", async () => {
    const html = await renderJob({ ...runningJob, status: "COMMITTED", phase: "DONE", processedRows: 10,
      result: { updatedProductCount: 0, inventoryLogCount: 0, batchOperationId: null,
        status: "COMMITTED", pendingApproval: false, undoAvailable: false } });
    expect(html).toContain("Tidak ada perubahan stok");
    expect(html).not.toContain("stok berhasil diperbarui");
  });

  it("shows a failed job's reason after the import panel has closed", async () => {
    const html = await renderJob({ ...runningJob, status: "FAILED", phase: "FAILED", errorMessage: "Koneksi database terputus" });
    expect(html).toContain("Koneksi database terputus");
    expect(html).toContain("Impor stok gagal");
  });
});
