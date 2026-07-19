# Peningkatan Akurasi dan Action Tools Pak Teladan

Tanggal: 19 Juli 2026

## Ringkasan

Pak Teladan kini memiliki action tools untuk mengekspor laporan, membuka modal inti, dan menganalisis Laporan Keuangan secara menyeluruh. Pesan chat juga mengirim konteks halaman aktif agar pemilihan tool lebih tepat.

## Ekspor melalui AI

- `exportFinancialReport` memakai ulang pipeline ekspor Laporan Keuangan yang sudah ada.
- `exportCustomerRecap` memakai ulang pipeline ekspor Rekap Pelanggan, termasuk Analisis AI rekap.
- Format yang didukung: PDF dan Excel (`.xlsx`).
- Periode yang didukung tool: harian, mingguan, bulanan, dan 30 hari terakhir.
- Jika pengguna tidak menyebut periode, sistem memakai 30 hari terakhir.
- Jika pengguna tidak menyebut format, sistem memakai PDF.

Contoh: `Ekspor laporan keuangan` langsung menghasilkan PDF untuk 30 hari terakhir, sedangkan `Ekspor rekap pelanggan mingguan ke Excel` mengikuti periode dan format yang disebutkan.

## Modal inti

Pak Teladan dapat membuka modal berikut sesuai hak akses pengguna:

- Tambah Produk
- Tambah Pelanggan
- Tambah Supplier
- Tambah Sales
- Tambah Pengeluaran
- Buka Shift
- Update Stok Satu Produk
- Penerimaan Barang

Jika pengguna sedang berada di halaman tujuan, modal dibuka langsung. Jika belum, aplikasi berpindah halaman dan membuka modal setelah halaman siap. Tool hanya membuka form; Pak Teladan tidak mengisi atau menyimpan data operasional secara otomatis.

## Analisis Laporan Keuangan menyeluruh

Tool `analyzeFinancialReport` memakai data dan perhitungan yang sama dengan halaman Laporan Keuangan. Analisis mencakup seluruh bagian berikut dalam satu rentang yang konsisten:

- ringkasan transaksi, omzet, uang terkumpul, laba kotor, margin, diskon, DP, pengeluaran, kualitas snapshot biaya, laba bersih estimasi, dan rekonsiliasi shift;
- metode pembayaran;
- produk teratas;
- kategori;
- performa sales;
- shift;
- loss stok;
- tren harian.

Jika periode tidak disebutkan, analisis memakai 30 hari terakhir. Jawaban AI diminta menghubungkan antarmetrik, menyatakan keterbatasan data, dan memberikan saran berbasis hasil tool tanpa mengarang angka.

## Pengamanan

- Tool tetap difilter dan divalidasi oleh RBAC backend.
- Action browser berasal dari definisi tool terpercaya, bukan payload bebas dari model.
- Argumen tool divalidasi dengan schema sebelum eksekusi.
- Form yang dibuka AI tetap memerlukan pemeriksaan dan konfirmasi pengguna.
- Ekspor memakai helper dan API yang sama dengan tombol ekspor manual untuk menghindari perbedaan hasil.

## Verifikasi

Pengujian mencakup routing intent, default periode/format, schema tool, stream action browser, pemakaian seluruh bagian laporan, helper ekspor, eksekusi modal lintas halaman, API chat, Bantuan, dan workflow catalog.
