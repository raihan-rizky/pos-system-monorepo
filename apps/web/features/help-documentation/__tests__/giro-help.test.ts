import { describe, expect, it } from "vitest";
import { HELP_ROLE_CONTENT } from "../components/HelpContent";
import { FAQ_WORKFLOWS } from "@/features/ai-assistant/workflows/workflow-catalog";
import { CHANGELOG } from "@/features/changelog/data/changelog";

describe("panduan giro dan laporan bulanan", () => {
  it.each(["OWNER", "ADMIN"])("menjelaskan peninjauan dan pembayaran giro bagi %s", role => {
    const text = JSON.stringify(HELP_ROLE_CONTENT[role]);
    for (const phrase of ["Giro Pembelian", "Belum diketahui", "Periksa riwayat", "riwayat pembayaran sudah lengkap", "Catat pembayaran", "Pastikan pembayaran", "expense:update", "RP bulan", "jatuh tempo", "pembayaran aktual"]) expect(text).toContain(phrase);
  });

  it("menyediakan alur giro dalam katalog asisten dan aturan lembar laporan", () => {
    const guide = JSON.stringify(FAQ_WORKFLOWS.find(item => item.faqNumber === 44));
    for (const phrase of ["Giro Pembelian", "Belum diketahui", "Periksa riwayat", "riwayat pembayaran sudah lengkap", "expense:update", "pembayaran aktual"]) expect(guide).toContain(phrase);
    const report = JSON.stringify(FAQ_WORKFLOWS.find(item => item.faqNumber === 21));
    for (const phrase of ["RP bulan", "pengeluaran manual", "jatuh tempo", "sisa giro", "pembayaran aktual"]) expect(report).toContain(phrase);
  });

  it.each(["OWNER", "ADMIN"])("menjelaskan penautan hutang manual pada giro terverifikasi bagi %s", role => {
    const text = JSON.stringify(HELP_ROLE_CONTENT[role].find(item => item.steps.some(step => step.title === "Periksa dan bayar giro")));
    for (const phrase of ["Hubungkan hutang manual", "catatan kedua hutang", "pembayaran yang sama", "transaksi berbeda", "pengeluaran manual"]) expect(text).toContain(phrase);
  });

  it("menyediakan alur penautan dengan pemeriksaan kedua riwayat dalam katalog asisten", () => {
    const text = JSON.stringify(FAQ_WORKFLOWS.find(item => item.faqNumber === 44));
    for (const phrase of ["Hubungkan hutang manual", "catatan kedua hutang", "pembayaran yang sama", "transaksi berbeda", "pengeluaran manual"]) expect(text).toContain(phrase);
  });

  it("mencatat perubahan giro dengan tanggal WIB dan tiga langkah", () => {
    const change = CHANGELOG.find(item => item.id === "giro-payments-monthly-report");
    expect(change).toMatchObject({ date: "2026-11-02", revision: 1, href: "/keuangan", visual: "financial" });
    expect(change?.steps).toHaveLength(3);
    expect(JSON.stringify(change)).toContain("Periksa riwayat");
    expect(JSON.stringify(change)).toContain("Catat pembayaran");
  });
});
