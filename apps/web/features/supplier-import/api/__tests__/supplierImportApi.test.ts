import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SupplierImportApiError,
  commitSupplierImport,
  previewSupplierImport,
} from "../supplierImportApi";

describe("supplier import API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends preview requests as form data", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          rows: [],
          missingColumns: [],
          unknownColumns: [],
          warnings: [],
          errors: [],
          existingNameMatches: [],
          removedEmptyRowCount: 1,
          requiredColumns: ["name"],
          suggestions: {},
        }),
        { status: 200 },
      ),
    );

    await previewSupplierImport({
      file: new File(["name\nCV Sinar"], "supplier.csv"),
      columnMapping: { Nama: "name" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/suppliers/import/preview",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData),
        cache: "no-store",
      }),
    );
  });

  it("sends commit payload and normalizes canonical errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Some rows still require an import decision",
          code: "Conflict",
          rowNumber: 2,
        }),
        { status: 409 },
      ),
    );

    await expect(
      commitSupplierImport({
        rows: [],
        decisions: {},
        selectedExistingSupplierIds: {},
      }),
    ).rejects.toMatchObject({
      name: "SupplierImportApiError",
      status: 409,
      payload: {
        code: "Conflict",
        rowNumber: 2,
      },
    } satisfies Partial<SupplierImportApiError>);
  });
});
