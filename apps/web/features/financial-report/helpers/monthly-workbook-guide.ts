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
    if (options.target) anchor.l = { Target: options.target, Tooltip: "Klik untuk membuka sel di laporan" };
  }

  const link = (name: string, cell: string) => `#'${name.replace(/'/g, "''")}'!${cell}`;
  block("A2:L3", "PANDUAN MEMBACA & MELENGKAPI LAPORAN", brand, { solid: true, size: 18 });
  block("A4:L4", `${period} • Petunjuk dibaca di sini; angka diisi pada sheet laporan.`, surface, { size: 11 });
  block("A6:L6", "01  MULAI DARI SINI", brand, { solid: true, size: 13 });
  block("A8:D8", "1. Periksa periode", brandDeep, { solid: true });
  block("A9:D11", "Pastikan bulan dan tahun benar. Data sistem sudah disalin saat file diekspor.", brand);
  block("E8:H8", "2. Lengkapi isian manual", input, { solid: true });
  block("E9:H11", "Klik tautan kuning di bawah, lalu isi modal awal, persediaan akhir, dan total hutang.", input);
  block("I8:L8", "3. Baca hasil otomatis", success, { solid: true });
  block("I9:L11", "Excel menghitung ulang rumus. Periksa BERSIH dan LAP KEU, lalu simpan file Anda.", success);
  block("A13:L13", "Warna panduan: BIRU = alur • KUNING = isian Anda • HIJAU = hasil • ORANYE = catatan", surface, { size: 11, center: true });

  block("A15:L15", "02  LENGKAPI TIGA ISIAN MANUAL", brand, { solid: true, size: 13 });
  block("A17:D17", "MODAL AWAL", input, { solid: true });
  block("E17:H17", "PERSEDIAAN AKHIR", input, { solid: true });
  block("I17:L17", "HUTANG PEMASOK", input, { solid: true });
  block("A18:D20", "Isi saldo modal awal periode sesuai catatan Anda. File sengaja mengosongkan nilai ini.", input);
  block("E18:H20", "Isi nilai rupiah persediaan pada akhir periode, bukan jumlah barang.", input);
  block("I18:L20", "Isi total saldo hutang pemasok pada akhir periode pada satu sel Nilai.", input);
  block("A21:D22", "→ Isi LAP KEU!D8", input, { center: true, target: link("LAP KEU", "D8") });
  block("E21:H22", "→ Isi LAP KEU!D17", input, { center: true, target: link("LAP KEU", "D17") });
  block("I21:L22", `→ Isi PIUTANG & HUTANG!D${debtRow}`, input, { center: true, target: link("PIUTANG & HUTANG", `D${debtRow}`) });
  block("A24:L25", "KOSONG ≠ NOL. Kosong berarti belum diisi. Masukkan 0 hanya jika nilainya memang nol. Jumlah harta dan kekayaan bersih menunggu ketiga isian lengkap.", accent);

  block("A27:L27", "03  DARI MANA ANGKA OTOMATIS BERASAL?", brand, { solid: true, size: 13 });
  block("A29:D29", "RC = RINCIAN PENERIMAAN", success, { solid: true, target: link(`RC ${monthName}`, "A7") });
  block("E29:H29", "RP = RINCIAN PENGELUARAN", accent, { solid: true, target: link(`RP ${monthName}`, "A7") });
  block("I29:L29", "PIUTANG = SALDO AKHIR", brandDeep, { solid: true, target: link("PIUTANG & HUTANG", "A7") });
  block("A30:D32", "Nilai penerimaan dari sistem menjadi sumber rekap harian dan total pendapatan.", success);
  block("E30:H32", "Nilai pengeluaran dari sistem, termasuk belanja dan gaji tercatat, menjadi sumber total biaya.", accent);
  block("I30:L32", "Saldo piutang akhir periode masuk ke ringkasan harta. Saldo ini bukan tambahan penerimaan kas.", brand);
  block("A34:B36", "RC + RP", brandDeep, { solid: true, center: true });
  block("C34:C36", "→", surface, { size: 22, center: true });
  block("D34:E36", monthName, brand, { solid: true, center: true, target: link(monthName, "A5") });
  block("F34:F36", "→", surface, { size: 22, center: true });
  block("G34:I36", "BERSIH", success, { solid: true, center: true, target: link("BERSIH", "F27") });
  block("J34:J36", "→", surface, { size: 22, center: true });
  block("K34:L36", "LAP KEU", brand, { solid: true, center: true, target: link("LAP KEU", "G29") });
  block("A38:L39", "Data tidak tersambung langsung ke aplikasi. Perubahan di aplikasi memerlukan ekspor ulang. Perubahan angka sumber di file hanya menghitung ulang rumus Excel; jangan mengganti sel rumus.", accent);

  block("A41:L41", "04  CARA ANGKA DIHITUNG", brand, { solid: true, size: 13 });
  block("A42:L42", "ILUSTRASI • Contoh berikut bukan angka laporan Anda.", surface, { size: 11 });
  block("A43:D43", "PENERIMAAN", success, { solid: true, center: true });
  block("E43:H43", "− PENGELUARAN", accent, { solid: true, center: true });
  block("I43:L43", "= SISA KAS", brand, { solid: true, center: true });
  block("A44:D46", "Rp10.000.000", success, { size: 20, center: true });
  block("E44:H46", "Rp7.000.000", accent, { size: 20, center: true });
  block("I44:L46", "Rp3.000.000", brand, { size: 20, center: true });
  block("A48:L49", "Jumlah harta = modal awal + piutang − hutang + persediaan akhir", brand);
  block("A50:L51", "Kekayaan bersih = jumlah harta + sisa kas", success, { target: link("LAP KEU", "D32") });
  block("A52:L52", "Rumus ringkasan pada file ini • Basis kas; selisih kas bukan laba akrual lengkap.", surface, { size: 11 });

  block("A54:L54", "05  CATATAN AGAR ANGKA TIDAK DIHITUNG DUA KALI", brand, { solid: true, size: 13 });
  block("A56:F58", "BELANJA SUDAH TERMASUK RP\nPENGELUARAN BELANJA adalah rincian tambahan. Jangan tambahkan totalnya lagi ke pengeluaran.", accent);
  block("G56:L58", "PERLU PEMETAAN SUDAH TERMASUK TOTAL\nPenerimaan yang belum memiliki kategori tetap dihitung. Periksa pemetaannya di aplikasi, lalu ekspor ulang.", accent);
  block("A60:F62", "GAJI TERCATAT TETAP DIHITUNG\nPengeluaran gaji/mingguan masuk ke RP dan rekap. Tidak ada sheet gaji terpisah.", brand);
  block("G60:L62", "GIRO TIDAK OTOMATIS MENJADI HUTANG\nMetode pembayaran belanja tidak menentukan saldo hutang pemasok. Isi saldo berdasarkan catatan Anda.", accent);
  block("A64:L66", "SEBELUM DISIMPAN\nPastikan periode benar, tiga isian manual lengkap, dan rumus tetap utuh. Sisa kas positif = surplus; negatif = defisit. Untuk memperbarui data aplikasi, ekspor ulang dan lengkapi kembali isian manual.", success);
  return sheet;
}
