import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Stock action helper texts", () => {
  it("verifies PaymentModal.tsx has 'Aksi ini tidak akan mengubah stok'", () => {
    const source = readFileSync(join(process.cwd(), "components/PaymentModal.tsx"), "utf8");
    expect(source).toContain("Aksi ini tidak akan mengubah stok");
  });

  it("verifies NotaPenawaranModal.tsx has 'Aksi ini tidak akan mengubah stok'", () => {
    const source = readFileSync(join(process.cwd(), "features/nota-penawaran/components/NotaPenawaranModal.tsx"), "utf8");
    expect(source).toContain("Aksi ini tidak akan mengubah stok");
  });

  it("verifies ApproveDraftDialog.tsx has 'Aksi ini tidak akan mengubah stok'", () => {
    const source = readFileSync(join(process.cwd(), "features/transactions-draft/components/ApproveDraftDialog.tsx"), "utf8");
    expect(source).toContain("Aksi ini tidak akan mengubah stok");
  });

  it("verifies SuratJalanHeader.tsx has 'Invoice utama ini tidak lagi mengubah stok'", () => {
    const source = readFileSync(join(process.cwd(), "features/surat-jalan/components/SuratJalanHeader.tsx"), "utf8");
    expect(source).toContain("Invoice utama ini tidak lagi mengubah stok");
  });

  it("explains that creating a shopping request does not change stock yet", () => {
    const source = readFileSync(join(process.cwd(), "features/suppliers/shopping-requests/components/ShoppingRequestCreateModal.tsx"), "utf8");
    expect(source).toContain("Stok belum berubah sampai permohonan disetujui");
  });

  it("explains that approval increases stock from accepted quantity", () => {
    const source = readFileSync(join(process.cwd(), "features/suppliers/shopping-requests/components/ShoppingRequestApproveModal.tsx"), "utf8");
    expect(source).toContain("Stok akan bertambah sesuai Jumlah yang Di-ACC");
  });
});
