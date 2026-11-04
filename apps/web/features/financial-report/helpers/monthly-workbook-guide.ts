import { utils } from "xlsx-js-style";
import type { WorkSheet } from "xlsx-js-style";
import { MONTHLY_CONTENT_PALETTES } from "./monthly-workbook-theme";

type GuideContext = { monthName: string; debtRow: number; period: string };
type Palette = (typeof MONTHLY_CONTENT_PALETTES)[keyof typeof MONTHLY_CONTENT_PALETTES];

/** A reading guide only: report cells and calculations keep their original layout. */
export function buildMonthlyGuide({ monthName, debtRow, period }: GuideContext): WorkSheet {
  const { brand, brandDeep, success, accent, input, surface } = MONTHLY_CONTENT_PALETTES;
  const sheet: WorkSheet = {
    "!ref": "A1:L66",
    "!cols": Array.from({ length: 12 }, () => ({ wch: 10 })),
    "!rows": Array.from({ length: 66 }, () => ({ hpt: 20 })),
    "!merges": [],
    "!margins": { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
  };
  for (let row = 0; row < 66; row++) {
    for (let col = 0; col < 12; col++) {
      sheet[utils.encode_cell({ r: row, c: col })] = {
        t: "s", v: "", s: { fill: { fgColor: { rgb: "FFFFFF" } }, font: { name: "Calibri", sz: 12, color: { rgb: surface.ink } } },
      };
    }
  }

  function block(range: string, text: string, palette: Palette, options: { solid?: boolean; size?: number; center?: boolean; target?: string } = {}): void {
    const bounds = utils.decode_range(range);
    sheet["!merges"]!.push(bounds);
    for (let row = bounds.s.r; row <= bounds.e.r; row++) {
      for (let col = bounds.s.c; col <= bounds.e.c; col++) {
        sheet[utils.encode_cell({ r: row, c: col })].s = {
          fill: { fgColor: { rgb: options.solid ? palette.head : palette.stripe } },
          font: { name: "Calibri", sz: options.size ?? 12, bold: options.solid || !!options.target, color: { rgb: options.solid ? "FFFFFF" : palette.ink }, underline: !!options.target },
          alignment: { vertical: "center", horizontal: options.center ? "center" : "left", wrapText: true, indent: options.center ? 0 : 1 },
          border: { top: { style: "thin", color: { rgb: "FFFFFF" } }, bottom: { style: "thin", color: { rgb: "FFFFFF" } }, left: { style: "thin", color: { rgb: "FFFFFF" } }, right: { style: "thin", color: { rgb: "FFFFFF" } } },
        };
      }
    }
    const anchor = sheet[utils.encode_cell(bounds.s)];
    anchor.v = text;
    if (options.target) anchor.l = { Target: options.target, Tooltip: "Klik untuk langsung ke bagian ini di laporan" };
  }

  const link = (name: string, cell: string) => `#'${name.replace(/'/g, "''")}'!${cell}`;
  block("A2:L3", "CARA PAKAI LAPORAN INI", brand, { solid: true, size: 18 });
  block("A4:L4", `${period} • Baca panduan dan buka bagian laporan lewat tautan di bawah.`, surface, { size: 11 });
  block("A6:L6", "01  Mulai dari sini", brand, { solid: true, size: 13 });
  block("A8:D8", "1. Cek bulan & tahun", brandDeep, { solid: true });
  block("A9:D11", "Cek dulu bulan dan tahunnya. Data dari aplikasi sudah masuk ke file saat diunduh.", brand);
  block("E8:H8", "2. Periksa saldo", input, { solid: true });
  block("E9:H11", "Modal awal, stok akhir, dan hutang diambil otomatis dari data yang tersedia.", input);
  block("I8:L8", "3. Lihat hasilnya", success, { solid: true });
  block("I9:L11", "Cek BERSIH dan LAP KEU untuk melihat hasil perhitungan, lalu simpan.", success);
  block("A13:L13", "Biru = alur angka • Hijau = hasil hitungan • Oranye = catatan", surface, { size: 11, center: true });

  block("A15:L15", "02  Sumber saldo otomatis", brand, { solid: true, size: 13 });
  block("A17:D17", "Modal awal", input, { solid: true });
  block("E17:H17", "Nilai stok akhir", input, { solid: true });
  block("I17:L17", "Hutang ke pemasok", input, { solid: true });
  block("A18:D20", "Diambil dari nilai inventaris akhir bulan sebelumnya bila riwayat tersedia.", input);
  block("E18:H20", "Nilai inventaris akhir periode memakai HPP tiap satuan, dengan konversi HPP otomatis dan stok bersama dihitung sekali.", input);
  block("I18:L20", "Sisa hutang pemasok dan giro hingga akhir periode; riwayat yang belum diperiksa membuat total belum tersedia.", input);
  block("A21:D22", "→ Lihat modal awal (D8)", input, { center: true, target: link("LAP KEU", "D8") });
  block("E21:H22", "→ Lihat nilai stok (D17)", input, { center: true, target: link("LAP KEU", "D17") });
  block("I21:L22", `→ Lihat hutang (D${debtRow})`, input, { center: true, target: link("PIUTANG & HUTANG", `D${debtRow}`) });
  block("A24:L25", "Nilai inventaris memakai HPP tiap satuan dan stok bersama dihitung sekali. HPP kosong dikonversi otomatis. Riwayat atau HPP belum lengkap tetap kosong; jumlah harta menunggu data lengkap.", accent);

  block("A27:L27", "03  Angka-angkanya dari mana?", brand, { solid: true, size: 13 });
  block("A29:D29", "RC = UANG MASUK", success, { solid: true, target: link(`RC ${monthName}`, "A7") });
  block("E29:H29", "RP = UANG KELUAR", accent, { solid: true, target: link(`RP ${monthName}`, "A7") });
  block("I29:L29", "PIUTANG = BELUM DIBAYAR", brandDeep, { solid: true, target: link("PIUTANG & HUTANG", "A7") });
  block("A30:D32", "Penerimaan transaksi dan Tambah Pemasukan di Keuangan masuk RC sesuai kategori, lalu dijumlahkan ke rekap.", success);
  block("E30:H32", "Semua pengeluaran dihitung sekali. Tambah Belanja Transfer juga tampil di PENGELUARAN BELANJA → VIA TRANSFER.", accent);
  block("I30:L32", "Ini sisa tagihan pelanggan di tanggal akhir laporan. Masuk ke ringkasan harta, tapi belum jadi uang yang diterima.", brand);
  block("A34:B36", "RC + RP + BELANJA", brandDeep, { solid: true, center: true });
  block("C34:C36", "→", surface, { size: 22, center: true });
  block("D34:E36", monthName, brand, { solid: true, center: true, target: link(monthName, "A5") });
  block("F34:F36", "→", surface, { size: 22, center: true });
  block("G34:I36", "BERSIH", success, { solid: true, center: true, target: link("BERSIH", "F27") });
  block("J34:J36", "→", surface, { size: 22, center: true });
  block("K34:L36", "LAP KEU", brand, { solid: true, center: true, target: link("LAP KEU", "G29") });
  block("A38:L39", "Ada perubahan di aplikasi? Unduh ulang laporannya agar saldo dan rincian kembali sesuai data terbaru.", accent);

  block("A41:L41", "04  Begini cara hitungnya", brand, { solid: true, size: 13 });
  block("A42:L42", "CONTOH SAJA • Angka di bawah bukan angka dari laporanmu.", surface, { size: 11 });
  block("A43:D43", "UANG MASUK", success, { solid: true, center: true });
  block("E43:H43", "− UANG KELUAR", accent, { solid: true, center: true });
  block("I43:L43", "= SISA UANG", brand, { solid: true, center: true });
  block("A44:D46", "Rp10.000.000", success, { size: 20, center: true });
  block("E44:H46", "Rp7.000.000", accent, { size: 20, center: true });
  block("I44:L46", "Rp3.000.000", brand, { size: 20, center: true });
  block("A48:L49", "Jumlah harta = modal awal + piutang − hutang − nilai stok akhir (persediaan)", brand);
  block("A50:L51", "Kekayaan bersih = jumlah harta + sisa kas", success, { target: link("LAP KEU", "D32") });
  block("A52:L52", "Yang dihitung: uang yang sudah masuk dan keluar. Tagihan yang belum dibayar belum jadi uang masuk.", surface, { size: 11 });

  block("A54:L54", "05  Jangan sampai dihitung dua kali", brand, { solid: true, size: 13 });
  block("A56:F58", "Jadwal berbeda dari kas\nGiro tampil pada bulan jatuh tempo. Kas hanya menghitung pembayaran giro dan transfer yang benar-benar tercatat.", accent);
  block("G56:L58", "Belum ada kategori? Tetap dihitung\nAngka di bagian Perlu pemetaan sudah masuk total. Cek kategorinya di aplikasi, lalu unduh ulang kalau ada perubahan.", accent);
  block("A60:F62", "Kategori Gaji/Mingguan\nHanya kategori Gaji/Mingguan masuk kolom gaji. Gaji dan kategori lain masuk Nilai. Unduh ulang setelah mengubah kategori; total dihitung sekali.", brand);
  block("G60:L62", "Sisa giro termasuk hutang\nPembayaran mengurangi hutang sesuai tanggal bayar. Riwayat lama perlu diperiksa di Keuangan.", accent);
  block("A64:L66", "Sudah siap disimpan?\nCek bulan, saldo yang tersedia, dan hasilnya. Hasil positif berarti ada sisa uang; hasil negatif berarti pengeluaran lebih besar.", success);
  return sheet;
}
