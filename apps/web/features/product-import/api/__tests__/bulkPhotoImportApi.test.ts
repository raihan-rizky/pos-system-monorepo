import { afterEach, describe, expect, it, vi } from "vitest";

import { lookupSkus } from "../bulkPhotoImportApi";

describe("bulk photo import API", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws a useful error when SKU lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: vi.fn().mockResolvedValue({ message: "Unauthorized" }),
      }),
    );

    await expect(lookupSkus(["sku-1"])).rejects.toThrow("Unauthorized");
  });
});
