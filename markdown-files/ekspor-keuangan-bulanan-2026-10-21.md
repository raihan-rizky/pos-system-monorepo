# Ekspor Excel keuangan bulanan

Tanggal rilis: **2026-10-21**, Asia/Jakarta (WIB).

## Cara menggunakan

1. Buka **Laporan Keuangan**, lalu klik **Ekspor**.
2. Gunakan **Laporan bulanan · Excel 7 sheet**, pilih bulan dan tahun, lalu
   periksa periode dan daftar sheet.
3. Klik **Unduh Excel**. Berkas bernama `laporan-keuangan-YYYY-MM.xlsx`.
4. Buka berkas dan isi modal awal di sel kuning **LAP KEU!D8**. Sel ini kosong
   saat diunduh dan dapat diisi dengan nominal nol.

Pilihan **Jurnal transaksi · Excel / PDF** menyediakan ekspor jurnal sebelumnya
dengan periode Harian, Mingguan, 30 hari terakhir, atau Bulanan. Ekspor melalui
Pak Teladan tetap menghasilkan jurnal; template tujuh sheet tersedia melalui
dialog di halaman Laporan Keuangan.

## Isi workbook

| Sheet | Isi |
| --- | --- |
| LAP KEU | Ringkasan harta, hutang, persediaan, penerimaan, pengeluaran, dan hasil bersih |
| BERSIH | Kelompok pendapatan dan pengeluaran berdampingan beserta ringkasan |
| Nama bulan | Rekap setiap tanggal, termasuk tanggal tanpa transaksi |
| RC [bulan] | Rincian penerimaan per kelompok serta penerimaan yang perlu pemetaan |
| RP [bulan] | Rincian pengeluaran, biaya gaji tercatat, dan kelompok biaya |
| PENGELUARAN BELANJA | Rincian belanja menurut metode pembayaran sebenarnya |
| PIUTANG & HUTANG | Piutang pada batas periode dan bagian hutang pemasok |

Susunan ringkasan dan kelompok kolom mengikuti contoh Agustus/September 2026
yang diberikan. Header, warna subtotal, baris berselang, pembekuan panel,
format angka, catatan sel, area cetak, dan header cetak membantu pembacaan.
Sheet **Gaji** dan **Pengeluaran Non Teladan** tidak disertakan. Biaya gaji
yang sudah tercatat tetap masuk pengeluaran.

## Periode dan perhitungan

- Periode memakai WIB. Bulan lampau sampai akhir bulan; bulan berjalan sampai
  hari ini. Bulan mendatang tidak dapat diekspor.
- Penerimaan mengikuti tanggal uang diterima, termasuk DP, split payment,
  pelunasan, dan kembalian. Total kategori tetap sama dengan nilai penerimaan.
- Pengeluaran memakai nominal setelah kembalian. Rincian belanja merupakan
  biaya yang sama dengan RP dan tidak ditambahkan lagi.
- Kelompok yang belum dapat dikenali ditampilkan sebagai **Perlu pemetaan**
  atau **Lain-lain** sesuai jenisnya. Nilainya tetap dihitung.
- Rumus antarsheet memperbarui subtotal dan ringkasan. Nilai hasil perhitungan
  awal disimpan agar total dapat dibaca sebelum kalkulasi ulang.

## Batas data yang telah disetujui

- Modal awal diisi manual di Excel.
- Nilai persediaan akhir historis dan saldo hutang pemasok belum memiliki
  sumber lengkap. Sel terkait tetap kosong dengan catatan, bukan dianggap nol.
- Jumlah harta dan kekayaan bersih menunggu input saldo yang diperlukan.
- Laporan memakai basis kas; hasil bersih adalah selisih penerimaan dan
  pengeluaran, bukan laporan laba akrual lengkap.
- Perubahan nominal dan retur pada transaksi lama belum mempunyai riwayat
  lengkap untuk merekonstruksi semua saldo masa lalu. Peringatan disertakan
  pada workbook ketika kondisi data memerlukannya.
- Kategori biaya historis yang tidak mempunyai snapshot tepercaya masuk
  Lain-lain. Harga pokok yang tidak lengkap diberi peringatan.

## Implementasi

Endpoint `GET /api/finance/report/monthly?year=YYYY&month=M` membutuhkan
permission `financial-report:read` dan toko dari sesi pengguna. Seluruh query
dibatasi toko tersebut. Respons memakai `private, no-store`; periode tidak
valid ditolak dengan 422.

Pembuat workbook dan dialog menggunakan kontrak `MonthlyFinancialReport`.
Library Excel dimuat ketika pengguna mengunduh. Workbook contoh pribadi
tidak diubah, disalin ke aplikasi, atau dijadikan dependency saat runtime.
Dialog mempertahankan pilihan ketika gagal, menyediakan Coba lagi, mencegah
unduhan ganda, serta mendukung fokus keyboard, Escape, dan layar ponsel.

Bantuan Owner/Admin, penanda visual panduan, FAQ Q21, panduan keuangan Pak
Teladan, workflow Q21, dan Catatan Perubahan telah diperbarui. Screenshot rilis
hanya menampilkan dialog dengan data contoh.

## Verifikasi

- Pemeriksaan snapshot commit di atas `origin/main` terbaru: **223/223 tes
  lulus dalam 18 file**, serta TypeScript seluruh aplikasi web lulus. Snapshot
  hanya memuat perubahan ekspor keuangan; perubahan Inventory di workspace
  aktif tidak ikut disertakan.
- TDD dijalankan untuk kontrak data, endpoint, workbook, adapter unduhan,
  dialog, dan panduan. Temuan review diperbaiki setelah direproduksi.
- Regresi akhir: **222 lulus dari 223 tes dalam 18 file**. Seluruh tes
  keuangan, endpoint, workbook, unduhan, workflow, Catatan Perubahan, dan
  panduan visual lulus. Satu kegagalan berada pada tes panduan penerimaan
  barang: ekspektasi `Pilih Pembelian Barang` tidak cocok dengan konten
  Inventory yang diubah terpisah.
- Tes browser lulus pada lebar **1200, 390, dan 320 px**: periode WIB, tujuh
  sheet, fokus, Escape, status sibuk, gagal/coba lagi/unduh, seluruh delapan
  kombinasi format/periode jurnal, dan tombol yang tetap terlihat.
- ESLint pada file fitur dan integrasi: **0 error, 0 warning**.
- TypeScript seluruh aplikasi web (`tsc --noEmit --incremental false`):
  **lulus**, exit code 0, tanpa diagnostik pada pemeriksaan terakhir.
- Workbook data sintetis berhasil dibuka dan dihitung ulang dengan modal
  **1.000.000** dan **0**. Penerimaan **287.000**, pengeluaran **70.000**, dan
  hasil bersih **217.000** cocok; saldo yang belum tersedia tetap kosong.
  Tujuh pratinjau sheet diperiksa. Runner render Windows mengeluarkan hasil
  PASS dan semua PNG, lalu berakhir dengan error native saat penutupan;
  pemeriksaan unit XLSX dan browser tetap selesai normal.
- Review independen mengonfirmasi perbaikan tinggi baris piutang, header
  cetak metode belanja, urutan XML footer, dan latar sel yang terbaca.
- `git diff --check` pada cakupan perubahan lulus. GitNexus menandai risiko
  rendah pada simbol ekspor/panduan yang tersedia di indeks. Pemeriksaan diff
  seluruh workspace mencakup pekerjaan lain dan melaporkan risiko medium;
  simbol baru belum terdapat pada indeks.

## Catatan lingkungan

- Dokumentasi disimpan pada `markdown-files` di checkout aktif karena drive
  `D:\main_project` tidak tersedia.
- Headroom dipanggil pada awal dan akhir sesi. Proxy kompresinya tidak dapat
  dihubungi; pemeriksaan menggunakan keluaran perintah yang dibatasi.
- Server pengembangan tidak dijalankan ulang dan production build tidak
  dijalankan. Tidak ada dependency atau migrasi database baru.
- Perubahan lain yang sedang berjalan di workspace dipertahankan.
