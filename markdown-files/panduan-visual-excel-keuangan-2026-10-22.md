# Panduan visual pada ekspor Excel keuangan

Tanggal rilis: 2026-10-22 (Asia/Jakarta).

## Penggunaan

1. Buka **Laporan Keuangan → Ekspor → Laporan bulanan · Excel 8 sheet**.
2. Pilih bulan dan tahun, unduh Excel, lalu buka tab terakhir **PANDUAN**.
3. Ikuti tautan kuning untuk mengisi modal awal, nilai persediaan akhir,
   dan total saldo hutang pemasok. Periksa hasil otomatis dan simpan file.

## Isi dan tampilan

- Biru menjelaskan alur, kuning menunjukkan langkah isian manual, hijau
  menjelaskan hasil otomatis, dan oranye menunjukkan catatan penting.
- Semua warna berasal dari token tema web dan palet status keuangan yang
  sudah dipakai ekspor. Warna panduan tidak mengubah warna sel laporan.
- Diagram menjelaskan alur RC/RP → rekap bulan → BERSIH → LAP KEU;
  saldo piutang masuk ke ringkasan harta, bukan penerimaan kas tambahan.
- Contoh Rp10 juta − Rp7 juta = Rp3 juta diberi label **CONTOH SAJA**;
  angka tersebut bukan data pengguna dan tidak masuk perhitungan laporan.
- Rumus jumlah harta dan kekayaan bersih dijelaskan sesuai rumus workbook.
- Bahasa panduan dibuat santai dengan instruksi pendek, misalnya
  “Cek bulan & tahun” dan “Isi tiga angka ini”; piutang dijelaskan sebagai
  tagihan pelanggan yang belum dibayar dan persediaan sebagai nilai stok.
- Panduan membahas kosong versus nol, basis kas, pemetaan penerimaan,
  gaji tercatat, belanja yang sudah termasuk RP, dan giro versus saldo hutang.

## Referensi isian

| Isian | Tujuan tautan |
| --- | --- |
| Modal awal | `LAP KEU!D8` |
| Nilai persediaan akhir | `LAP KEU!D17` |
| Total saldo hutang pemasok | Kolom D pada baris isian bagian HUTANG |

Baris hutang mengikuti panjang daftar piutang dan tidak ditetapkan secara
statis. Sel kosong berarti belum tersedia; angka 0 hanya dipakai bila
nilainya benar-benar nol. Ringkasan harta menunggu isian lengkap.

## Implementasi

- `monthly-workbook-guide.ts` membentuk panduan mandiri dengan sel gabungan
  dan tautan internal Excel. Tidak ada gambar teks atau ketergantungan baru.
- `monthly-workbook.ts` menambahkan PANDUAN setelah tujuh laporan asli.
  Nilai, rumus, komentar, ukuran, warna, dan tata letak laporan asli dipertahankan.
- Panduan memiliki area cetak A1:L66, A4 landscape, pengulangan judul
  baris 1–4, dan tidak memakai freeze baris maupun kolom.
- Data sistem merupakan salinan saat ekspor. Perubahan aplikasi memerlukan
  ekspor ulang; perubahan nilai sumber dalam file menghitung ulang rumus Excel.
- Dialog ekspor, Bantuan, FAQ, workflow AI, dan Catatan Perubahan diperbarui.

## Verifikasi

- TDD: tes gagal karena PANDUAN belum ada sebelum implementasi.
- Uji tautan pada daftar piutang kosong, satu baris, dan lima baris;
  tautan selalu menuju sel isian yang kosong dan tidak memiliki rumus.
- Uji serialisasi XLSX, warna token tema, area cetak, dan tidak ada freeze kolom.
- Bandingkan tujuh sheet asli sebelum/sesudah dan tinjau render panduan.
- Hasil: **158 tes dalam 13 file lulus**, TypeScript dan ESLint lulus.
- Browser lulus pada lebar **1200, 390, dan 320 px**, termasuk delapan sheet,
  keyboard/fokus/Escape, unduhan, status sibuk, dan coba lagi.
- Seluruh **84 perbandingan sheet asli** identik pada empat bulan dan tiga
  panjang daftar piutang. Isian manual lengkap menghasilkan ringkasan yang
  dihitung ulang; mengosongkan persediaan kembali mengosongkan hasil terkait.
- Empat render panduan diperiksa; screenshot Catatan Perubahan hanya
  menampilkan petunjuk tanpa data transaksi, pelanggan, atau ringkasan keuangan.
- Revisi bahasa: 16 tes workbook dan lint lulus. Perbandingan dengan versi
  sebelumnya memastikan hanya teks panduan dan tooltip yang berubah; rumus,
  tautan tujuan, ukuran, warna, dan susunan seluruh sheet tetap sama.
- Saat render revisi bahasa, seluruh assertion selesai dan empat PNG ditulis,
  lalu runtime native keluar dengan kode `0xC0000409` saat proses ditutup.
  Semua PNG telah diperiksa secara visual; ini keterbatasan alat verifikasi.
- GitNexus tidak dapat berjalan karena Application Control Windows memblokir
  modul native `tree-sitter-cpp`; cakupan diperiksa melalui pemanggil langsung.
- Headroom stats dipanggil; proxy kompresi tidak tersedia, sehingga output
  pemeriksaan dibatasi.

Lokasi dokumentasi D: yang disebut AGENTS.md tidak tersedia pada mesin ini;
dokumentasi disimpan di `markdown-files` dalam repository aktif.
