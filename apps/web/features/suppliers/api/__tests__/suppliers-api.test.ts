import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SupplierApiError,
  createSupplier,
  listSuppliers,
} from "../suppliers-api";

describe("suppliers API client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serializes supplier list filters into query parameters", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          pagination: {
            total: 0,
            page: 2,
            limit: 10,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: true,
          },
        }),
        { status: 200 },
      ),
    );

    await listSuppliers({
      q: "sinar",
      type: "DISTRIBUTOR",
      isActive: true,
      page: 2,
      limit: 10,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/suppliers?q=sinar&type=DISTRIBUTOR&isActive=true&page=2&limit=10",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("preserves duplicate warnings from create responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            id: "supplier-1",
            name: "CV Sinar Jaya",
            type: "DISTRIBUTOR",
            phone: null,
            contactPerson: null,
            address: null,
            notes: null,
            isActive: true,
            createdAt: "2026-06-06T00:00:00.000Z",
            updatedAt: "2026-06-06T00:00:00.000Z",
          },
          warnings: [
            {
              code: "DuplicateSupplierName",
              message: "Nama supplier mirip sudah ada.",
              matchedSupplierIds: ["supplier-old"],
            },
          ],
        }),
        { status: 201 },
      ),
    );

    const result = await createSupplier({
      name: "CV Sinar Jaya",
      type: "DISTRIBUTOR",
    });

    expect(result.warnings).toEqual([
      {
        code: "DuplicateSupplierName",
        message: "Nama supplier mirip sudah ada.",
        matchedSupplierIds: ["supplier-old"],
      },
    ]);
  });

  it("normalizes canonical API errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          message: "Validation error",
          code: "ValidationError",
          errors: { name: ["Name is required"] },
        }),
        { status: 422 },
      ),
    );

    await expect(
      createSupplier({ name: "", type: "DISTRIBUTOR" }),
    ).rejects.toMatchObject({
      name: "SupplierApiError",
      status: 422,
      payload: {
        code: "ValidationError",
        errors: { name: ["Name is required"] },
      },
    } satisfies Partial<SupplierApiError>);
  });
});
