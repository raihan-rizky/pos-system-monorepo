import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("approval shopping request cache invalidation", () => {
  it("does not refresh finance or stock data after approval", () => {
    const content = readFileSync(
      join(
        process.cwd(),
        "features/suppliers/shopping-requests/hooks/useShoppingRequests.ts",
      ),
      "utf8",
    );

    expect(content).not.toContain('queryKey: ["finance"]');
    expect(content).not.toContain('queryKey: ["financial-report"]');
    expect(content).not.toContain('queryKey: ["products"]');
    expect(content).not.toContain('queryKey: ["inventory-logs"]');
    expect(content).not.toContain('queryKey: ["inventory-management"]');
    expect(content).not.toContain('queryKey: ["receiving-queue"]');
  });
});
