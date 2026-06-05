import { afterEach, describe, expect, it, vi } from "vitest";
import { customerRecapApi } from "../customerRecapApi";

describe("customerRecapApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("unwraps page recap data from the API data envelope", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            dateFrom: "2026-05-01",
            dateTo: "2026-05-02",
            summary: { newCustomers: 2 },
            byType: [],
            topSpenders: [],
            trend: { granularity: "daily", points: [] },
          },
        }),
        { status: 200 },
      ),
    );

    const data = await customerRecapApi.getPageRecap({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-02",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/customers/recap?dateFrom=2026-05-01&dateTo=2026-05-02",
    );
    expect(data.summary.newCustomers).toBe(2);
  });

  it("throws the API message when the server returns an error envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          message: "Invalid customer recap date range",
          code: "ValidationError",
        }),
        { status: 422 },
      ),
    );

    await expect(
      customerRecapApi.getCustomerRecap("customer-1", {
        dateFrom: "bad",
        dateTo: "2026-05-02",
      }),
    ).rejects.toThrow("Invalid customer recap date range");
  });
});
