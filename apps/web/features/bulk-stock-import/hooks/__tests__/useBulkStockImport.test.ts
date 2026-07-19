import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  formatBulkStockImportApiErrorMessage,
  startBulkStockImportCommitJob,
  getBulkStockImportCommitJob,
} from "../useBulkStockImport";

describe("formatBulkStockImportApiErrorMessage", () => {
  it("uses field errors when the API returns a generic validation message", () => {
    expect(
      formatBulkStockImportApiErrorMessage(
        {
          message: "Validation error",
          errors: {
            stock: ["Stock cannot be negative or insufficient"],
          },
        },
        "Gagal menerapkan impor stok massal",
      ),
    ).toBe("Stock cannot be negative or insufficient");
  });

  it("keeps specific API messages", () => {
    expect(
      formatBulkStockImportApiErrorMessage(
        { message: "Supplier was not found" },
        "Gagal menerapkan impor stok massal",
      ),
    ).toBe("Supplier was not found");
  });
});

describe("bulk stock import job API", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("starts a commit job through the jobs endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "job-1", status: "PENDING", phase: "QUEUED" }),
    } as Response);

    const result = await startBulkStockImportCommitJob({
      mode: "ADD",
      rows: [
        {
          rowNumber: 2,
          name: "Kertas HVS A4",
          category: "ATK",
          unit: "Rim",
          stock: 5,
        },
      ],
    });

    expect(result.id).toBe("job-1");
    expect(fetch).toHaveBeenCalledWith(
      "/api/inventory/bulk/import/commit/jobs",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("loads commit job progress", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "job-1",
        status: "RUNNING",
        phase: "UPDATING_STOCK",
        totalRows: 10,
        processedRows: 4,
      }),
    } as Response);

    const result = await getBulkStockImportCommitJob("job-1");

    expect(result.processedRows).toBe(4);
    expect(fetch).toHaveBeenCalledWith(
      "/api/inventory/bulk/import/commit/jobs/job-1",
    );
  });
});
