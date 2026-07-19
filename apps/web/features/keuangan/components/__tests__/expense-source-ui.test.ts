import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("halaman Keuangan membedakan sumber pengeluaran", () => {
  it("shows source badges, missing-cost warning, and hides actions for automatic entries", () => {
    const content = readFileSync(
      join(process.cwd(), "app/(main)/keuangan/page.tsx"),
      "utf8",
    );

    expect(content).toContain("Permohonan Belanja");
    expect(content).toContain("Manual");
    expect(content).toContain("hasMissingCostSnapshot");
    expect(content).toContain('item.source.type === "SHOPPING_REQUEST"');
    expect(content).toContain("Harga modal tidak tersedia saat approval");
    expect(content).toContain("isAutomaticExpense");
  });
});
