# Kategori pengeluaran dan form hutang

## Penggunaan

- Buka **Keuangan → Tambah Pengeluaran**. Pilih **Tambah kategori**, isi nama, lalu pilih **Simpan kategori**. Kategori tersedia kembali untuk pengeluaran toko yang sama.
- Gunakan **Filter kategori** di bagian Pengeluaran untuk melihat pengeluaran kategori tersebut. Pilih **Semua kategori** untuk menghapus filter; ringkasan dan grafik tetap memakai seluruh pengeluaran bulan itu.
- Form **Tambahkan Hutang** mengelompokkan rincian dan pembayaran awal, menampilkan nominal dalam rupiah dan perkiraan sisa hutang, serta menjaga tombol simpan tetap terlihat.

## Penyimpanan dan laporan

Kategori khusus disimpan per toko dengan nama unik. Pengeluaran lama dan kategori bawaan tetap memakai nilai yang ada. Ringkasan dan jurnal menampilkan nama kategori khusus, termasuk pada rincian ekspor bulanan; kelompok perhitungan gaji dan biaya lain tidak berubah.

Migrasi `20261101120000_custom_expense_categories` telah diterapkan ke database development dan production pada 2026-11-01. Untuk database target lain, terapkan migrasi tersebut sebelum fitur digunakan. Pembuatan kategori mengikuti izin membuat pengeluaran; pemilihan dan filter mengikuti akses pengeluaran yang sudah ada.
