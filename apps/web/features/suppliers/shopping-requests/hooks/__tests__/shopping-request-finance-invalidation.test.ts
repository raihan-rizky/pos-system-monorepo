import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("approval shopping request cache invalidation", () => {
  it("refreshes finance and financial report after creating an automatic expense", () => {
    const content = readFileSync(
      join(
        process.cwd(),
        "features/suppliers/shopping-requests/hooks/useShoppingRequests.ts",
      ),
      "utf8",
    );

    expect(content).toContain('queryKey: ["finance"]');
    expect(content).toContain('queryKey: ["financial-report"]');
  });
});
