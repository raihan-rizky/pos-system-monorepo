import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("products page inventory workflow surfaces", () => {
  it("does not wire stock logs or stock history tabs into products", () => {
    const source = readFileSync(
      join(process.cwd(), "app/(main)/products/page.tsx"),
      "utf8",
    );

    expect(source).not.toContain("StockLogsTab");
    expect(source).not.toContain("StockHistoryTab");
    expect(source).not.toContain("Riwayat Stok");
    expect(source).not.toContain("Stock Logs");
    expect(source).not.toContain("StockUpdateModal");
  });
});
