# Rekonsiliasi Pemasukan, Pengeluaran, dan Arus Kas Bersih

## Pemasukan

Keuangan dan Laporan Keuangan tampilan Sales menggunakan sumber dan aturan hitung yang sama untuk satu toko dan tanggal WIB. Total Pemasukan bulanan di Keuangan adalah jumlah baris harian.

| Sumber | Tanggal pengakuan |
| --- | --- |
| Pembayaran awal penjualan dan DP | Tanggal nota |
| Pelunasan nota dan piutang manual | Tanggal pembayaran |
| Pemasukan manual | Tanggal yang dicatat |
| Pengembalian dana pemasok | Tanggal dana diterima |

Di tampilan Sales, rincian kategori, subkategori, dan metode pembayaran mengikuti hak akses. Pelunasan piutang manual dan pengembalian dana pemasok masuk kategori Lainnya. Jika metode belum tersedia pada catatan, nominal tetap masuk ke total dan tampil pada baris Belum dicatat.

## Pengeluaran dan Arus Kas Bersih

- Transfer dan pengeluaran manual mengikuti tanggal transaksi. Jika suatu pembelian punya beberapa pembayaran, tiap bagian diakui sesuai tanggalnya.
- Sisa giro muncul mulai tanggal jatuh tempo terbaru (WIB). Giro yang dicatat 17 November dan jatuh tempo 17 April baru muncul mulai 17 April bila belum ada pembayaran tercatat.
- Bila Rp30.000 dari giro Rp100.000 sudah dibayar pada November dan jatuh tempo pada Desember, November mencatat Rp30.000 dan Desember mencatat sisa Rp70.000. Pembayaran setelah jatuh tempo tidak dihitung ulang.
- Kelebihan pembayaran tetap dihitung hingga ada pengembalian yang tercatat. Uang yang sudah keluar untuk pembelian yang dibatalkan muncul sebagai baris koreksi di riwayat pada tanggal pembayaran. Pengembalian dana yang kemudian diterima muncul di Pemasukan.
- Riwayat, kategori, grafik, dan total mengambil pengeluaran dari baris yang sama. Filter kategori menyaring riwayat, sedangkan kartu menampilkan total bulan penuh.

Di Keuangan, buka **Lihat cara perhitungan** untuk memeriksa nominal setiap komponen dan rumus **Pemasukan − Pengeluaran = Net Cash Flow**. Jika riwayat giro belum lengkap, periksa riwayat pembayaran sebelum memakai total.
