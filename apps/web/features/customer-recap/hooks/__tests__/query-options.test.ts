import { describe, expect, it } from "vitest";
import {
  customerDetailRecapQueryOptions,
  customerRecapQueryOptions,
} from "../useCustomerRecap";

describe("customer recap query options", () => {
  it("uses stable page recap query keys", () => {
    const options = customerRecapQueryOptions({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-02",
    });

    expect(options.queryKey).toEqual([
      "customer-recap",
      "2026-05-01",
      "2026-05-02",
    ]);
    expect(options.staleTime).toBe(60_000);
  });

  it("uses stable detail recap query keys", () => {
    const options = customerDetailRecapQueryOptions("customer-1", {
      dateFrom: "2026-05-01",
      dateTo: "2026-05-02",
    });

    expect(options.queryKey).toEqual([
      "customer-recap",
      "customer-1",
      "2026-05-01",
      "2026-05-02",
    ]);
    expect(options.staleTime).toBe(60_000);
  });
});
