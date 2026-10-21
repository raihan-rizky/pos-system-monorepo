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

## Penyempurnaan visual workbook — 21 Oktober 2026

- Hapus pembekuan kolom kiri di seluruh sheet. Header atas pada rincian tetap
  dibekukan, menggunakan pane `bottomLeft` dan sel awal kolom A.
- Warna tab sesuai warna judul, header, subtotal, catatan, dan arsiran,
  menggunakan variasi biru brand, jingga accent, serta hijau status dari tema web.
- Ringkasan memakai baris kosong 6, atau baris 8 pada harian. Tidak ada
  pergeseran tabel, kolom, anchor rumus, maupun perubahan jumlah sheet.
- Ringkasan berbasis rumus: surplus/defisit kas, persentase sisa kas dengan
  penjagaan pembagi nol, penerimaan perlu pemetaan, jumlah penerimaan dan
  pengeluaran, biaya gaji, total belanja yang sudah masuk RP, serta jumlah
  nota piutang. Hutang yang belum tersedia tetap dinyatakan belum tersedia.
- Modal D8 tetap kosong, kuning, dan dapat diisi pengguna. Hasil kas negatif
  diberi pita merah saat ekspor. Seluruh area gabungan mendapat warna utuh.
- Tes baru diverifikasi gagal sebelum implementasi (4 gagal, 7 lulus), lalu
  11 tes workbook lulus. Regresi laporan keuangan dan panduan: **137 tes
  dalam 12 file lulus**. TypeScript web dan ESLint pada pembuat workbook,
  tema, serializer, serta tes workbook lulus tanpa diagnostik.
- Tujuh PNG sintetis diperiksa: seluruh judul, header, catatan, dan ringkasan
  terbaca. Rumus ringkasan dihitung ulang setelah perubahan penerimaan,
  termasuk penerimaan nol dan kas defisit. Modal kosong, nol, dan 1.000.000
  tetap mengikuti penjagaan saldo yang belum tersedia.
- Runner spreadsheet mencetak PASS dan menyimpan semua pratinjau, kemudian
  keluar dengan error native Windows `-1073740791` saat penutupan. Hasil
  render/perhitungan tersedia; tes XLSX dan regresi selesai normal.

## Catatan lingkungan

## Koreksi pewarnaan isi — 21 Oktober 2026

- Setiap sheet memakai beberapa warna pada isi data, bukan hanya identitas
  tab dan judul. Kategori usaha memiliki header, sel data berarsir selang-seling,
  serta subtotal berwarna yang sesuai.
- Pendapatan dan pengeluaran dipisahkan dengan hijau dan jingga; gaji biru tua,
  input modal kuning, piutang hijau, hutang merah muda, persediaan biru tua,
  dan hasil kas positif/negatif hijau/merah. Label dan angka tetap terbaca.
- Belanja memakai warna metode pembayaran (giro biru tua, transfer biru, metode
  lain hijau), tanggal biru, jatuh tempo kuning, dan nominal jingga.
- Helper `monthly-workbook-content.ts` hanya mengubah `cell.s`. Tes membandingkan
  seluruh workbook sebelum dan sesudah pewarnaan tanpa properti style, termasuk
  nilai, rumus, format angka, komentar, merges, lebar kolom, tinggi baris, dan
  definisi cetak. Bulan berisi transaksi, bulan kosong, serta metode belanja
  tambahan diperiksa. Tidak ada perubahan struktur layout atau pembekuan sisi.
- TDD: 2 tes gagal karena isi sebelumnya masih putih/satu warna, lalu lulus
  setelah pewarnaan. Sebanyak 110 tes laporan keuangan lulus. TypeScript lulus.
- Tujuh pratinjau sintetis diperiksa; perhitungan ulang modal, penerimaan nol,
  serta defisit kas tetap cocok. Runner render mencetak PASS dan menyimpan PNG,
  dengan keterbatasan error native Windows saat penutupan seperti sebelumnya.

### Sesuai tema web

- Palet bersumber dari `packages/config/tailwind.config.ts`: brand biru,
  accent jingga, dan surface netral. Status mengikuti emerald, amber, serta
  red yang dipakai `KpiCard.tsx`. Header memakai shade lebih gelap dengan
  teks putih; sel data memakai shade terang dengan teks gelap.
- Semua warna fill/font/border workbook diverifikasi terhadap token tema web
  dalam tes. Tidak ada lagi warna ungu, magenta, atau nila di luar palet web.
- Modal D8 tetap kosong dan kuning (`amber-100`, `FEF3C7`).
- TDD tema: 3 tes gagal sebelum penyesuaian palet; 14 tes workbook lulus
  setelah penyesuaian. Tes penjagaan seluruh layout tetap lulus.
- Pratinjau terbaru dari data sintetis tersedia di
  `output/monthly-financial-validation/`, dengan tujuh PNG dan workbook contoh.

- Dokumentasi disimpan pada `markdown-files` di checkout aktif karena drive
  `D:\main_project` tidak tersedia.
- Headroom dipanggil pada awal dan akhir sesi. Proxy kompresinya tidak dapat
  dihubungi; pemeriksaan menggunakan keluaran perintah yang dibatasi.
- Server pengembangan tidak dijalankan ulang dan production build tidak
  dijalankan. Tidak ada dependency atau migrasi database baru.
- Perubahan lain yang sedang berjalan di workspace dipertahankan.
