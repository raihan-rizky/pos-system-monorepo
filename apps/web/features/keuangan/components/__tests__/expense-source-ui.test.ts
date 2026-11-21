import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("halaman Keuangan membedakan sumber pengeluaran", () => {
  it("shows source badges, missing-cost warning, and routes automatic entries to correction", () => {
    const content = readFileSync(
      join(process.cwd(), "app/(main)/keuangan/page.tsx"),
      "utf8",
    );

    expect(content).toContain("Pembelian Barang");
    expect(content).toContain("Daftar Belanja (Legacy)");
    expect(content).toContain("Manual");
    expect(content).toContain("hasMissingCostSnapshot");
    expect(content).toContain('item.source.type === "GOODS_PURCHASE"');
    expect(content).toContain("Harga modal tidak tersedia saat approval");
    expect(content).toContain("isAutomaticExpense");
    expect(content).toContain("getExpenseCorrectionActions(item, canPerform)");
    expect(content).toContain("<ExpenseCorrectionPanel");
    expect(content).toContain("giro jatuh tempo ${fullDay(item.allocation.dueDate)}");
    expect(content).toContain('item.paidMethod === "TRANSFER" ? "Transfer" : "Pembayaran giro"');
    expect(content).toContain("tercatat {fullDay(item.paidAt)}");
  });
});
