# Dashboard dan Laporan

## Dashboard

Buka **Operasi > Dashboard** (`/dashboard`) untuk ringkasan performa toko. Dashboard menampilkan revenue dan profit hari ini/bulan ini, Outstanding DP, total produk, stok menipis, tren revenue/profit 7 hari, mix pembayaran hari ini, sales bulan berjalan, top pelanggan 30 hari, DP aktif, produk terlaris, dan transaksi terbaru.

## Keuangan

Buka **Keuangan > Keuangan** (`/keuangan`) untuk arus kas bulanan. Halaman ini menampilkan Net Cash Flow, grafik pemasukan/pengeluaran harian, pemasukan dari transaksi, serta daftar pengeluaran per kategori. Tambah, ubah, dan hapus pengeluaran mengikuti permission resource `expense`.

## Laporan Keuangan

Buka **Keuangan > Laporan Keuangan** (`/financial-report`). Pilih preset **Hari ini**, **7 hari**, **Bulan ini**, atau rentang tanggal manual sampai maksimal 366 hari.

Laporan memakai transaksi berstatus COMPLETED dan DP, lalu menampilkan:

- Omzet, uang terkumpul, laba kotor, margin, Outstanding DP, dan Loss Stok.
- Tren omzet/cost/laba kotor, metode pembayaran, loss stok per kategori, sales teratas, produk terlaris, kategori, dan rekonsiliasi shift.
- Peringatan jika HPP item belum diisi atau alasan loss stok belum diklasifikasikan.

**Ekspor** mendukung Excel atau PDF untuk periode Harian, Mingguan (7 hari), atau Bulanan. Periode ekspor dipilih di menu Ekspor dan tidak otomatis mengikuti rentang manual yang sedang tampil.

Semua halaman dan aksi laporan tunduk pada permission RBAC backend. Laba kotor bukan laba bersih: perhitungannya adalah omzet dikurangi HPP dan loss stok; item tanpa HPP memberi kontribusi gross profit 0.

## Kemampuan Pak Teladan

Tool laporan live Pak Teladan hanya tersedia untuk OWNER dan hanya merangkum satu tanggal: revenue, gross profit, dan jumlah transaksi COMPLETED. Tool tersebut tidak menyediakan rentang periode, arus kas, pengeluaran, ranking, mix pembayaran, loss stok, atau rekonsiliasi shift. Untuk data itu, arahkan pengguna ke halaman yang sesuai dan jangan mengarang angka.
