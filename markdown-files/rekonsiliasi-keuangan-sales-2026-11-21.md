# Rekonsiliasi Pemasukan, Pengeluaran, dan Arus Kas Bersih

## Pemasukan

Keuangan dan Laporan Keuangan tampilan Sales menggunakan sumber dan aturan hitung yang sama untuk satu toko dan tanggal WIB. Total Pemasukan bulanan di Keuangan adalah jumlah baris harian.

| Sumber | Tanggal pengakuan |
| --- | --- |
| Pembayaran awal penjualan dan DP | Tanggal nota |
| Pelunasan nota dan piutang manual | Tanggal pembayaran |
| Pemasukan manual | Tanggal yang dicatat |
| Pengembalian dana pemasok | Tanggal dana diterima |

Di tampilan Sales, rincian kategori, subkategori, dan metode pembayaran mengikuti hak akses. Pelunasan piutang manual memakai kategori yang dicatat. Catatan piutang lama tanpa kategori tampil sebagai Belum ditentukan di Sales dan Perlu pemetaan di Excel RC. Pengembalian dana pemasok masuk kategori Lainnya. Jika metode belum tersedia pada catatan, nominal tetap masuk ke total dan tampil pada baris Belum dicatat.

## Pengeluaran dan Arus Kas Bersih

- Transfer langsung dan pengeluaran manual mengikuti tanggal transaksi masing-masing. Alokasi pembayaran hutang mengikuti kategori hutang dan sisa transfer mengikuti kategori transfer. Transfer dan pembayaran yang terhubung dihitung satu kali.
- Pembayaran hutang manual memakai tanggal pembayaran aktual. Saat jatuh tempo dalam WIB, sisa hutang manual ditampilkan sebagai pelunasan bertanda **Otomatis** pada tanggal itu. Hutang tanpa jatuh tempo tetap terbuka sampai dibayar.
- Setiap bagian giro muncul pada bulan jatuh tempo terbaru, mulai pukul 00.00 WIB pada tanggal jatuh tempo. Aturan ini juga berlaku untuk pembelian lama dan giro yang dibayar lebih awal. Jika jadwal diubah, baris giro mengikuti tanggal baru.
- Giro Rp100.000 yang jatuh tempo pada 5 Desember dan sudah dibayar Rp30.000 pada November tampil mulai 5 Desember dengan rincian Rp30.000 pembayaran tercatat dan Rp70.000 sisa jatuh tempo. Baris pembayaran memperlihatkan tanggal dan metode asal. Pembayaran setelah jatuh tempo mengurangi tagihan tanpa menambah pengeluaran kedua.
- Kelebihan pembayaran masuk pada tanggal pembayaran. Uang yang sudah keluar untuk pembelian yang dibatalkan muncul sebagai baris koreksi pada tanggal pembayaran. Pengembalian dana yang diterima muncul di Pemasukan.
- Keuangan terbuka pada bulan berjalan (WIB). Riwayat, kategori, grafik, dan total menggunakan baris yang sama untuk bulan yang dipilih. Filter kategori menyaring riwayat, sedangkan kartu menampilkan total semua kategori bulan itu.

Di Keuangan, buka **Lihat cara perhitungan** untuk memeriksa nominal setiap komponen dan rumus **Pemasukan − Pengeluaran = Net Cash Flow**. Jika riwayat giro belum lengkap, periksa riwayat pembayaran sebelum memakai total.
