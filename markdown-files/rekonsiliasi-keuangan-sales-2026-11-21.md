# Rekonsiliasi Pemasukan, Pengeluaran, dan Arus Kas Bersih

## Pemasukan

Keuangan dan Laporan Keuangan tampilan Sales menggunakan sumber dan aturan hitung yang sama untuk satu toko dan tanggal WIB. Total Pemasukan bulanan di Keuangan adalah jumlah baris harian.

| Sumber | Tanggal pengakuan |
| --- | --- |
| Pembayaran awal penjualan dan DP | Tanggal nota |
| Pelunasan nota dan piutang manual | Tanggal pembayaran |
| Pemasukan manual | Tanggal yang dicatat |
| Pengembalian dana pemasok | Tanggal dana diterima |

Di tampilan Sales, rincian kategori, subkategori, dan metode pembayaran mengikuti hak akses. Pelunasan piutang manual memakai kategori yang dicatat. Pengembalian dana pemasok masuk kategori Lainnya. Jika metode belum tersedia pada catatan, nominal tetap masuk ke total dan tampil pada baris Belum dicatat.

## Pengeluaran dan Arus Kas Bersih

- Transfer langsung dan pengeluaran manual mengikuti tanggal transaksi masing-masing.
- Setiap bagian giro muncul pada bulan jatuh tempo terbaru, mulai pukul 00.00 WIB pada tanggal jatuh tempo. Aturan ini juga berlaku untuk pembelian lama dan giro yang dibayar lebih awal. Jika jadwal diubah, baris giro mengikuti tanggal baru.
- Giro Rp100.000 yang jatuh tempo pada 5 Desember dan sudah dibayar Rp30.000 pada November tampil mulai 5 Desember dengan rincian Rp30.000 pembayaran tercatat dan Rp70.000 sisa jatuh tempo. Baris pembayaran memperlihatkan tanggal dan metode asal. Pembayaran setelah jatuh tempo mengurangi tagihan tanpa menambah pengeluaran kedua.
- Kelebihan pembayaran masuk pada tanggal pembayaran. Uang yang sudah keluar untuk pembelian yang dibatalkan muncul sebagai baris koreksi pada tanggal pembayaran. Pengembalian dana yang diterima muncul di Pemasukan.
- Keuangan terbuka pada bulan berjalan (WIB). Riwayat, kategori, grafik, dan total menggunakan baris yang sama untuk bulan yang dipilih. Filter kategori menyaring riwayat, sedangkan kartu menampilkan total semua kategori bulan itu.

Di Keuangan, buka **Lihat cara perhitungan** untuk memeriksa nominal setiap komponen dan rumus **Pemasukan − Pengeluaran = Net Cash Flow**. Jika riwayat giro belum lengkap, periksa riwayat pembayaran sebelum memakai total.

## Arus Kas Bulan Ini di Dashboard

Panel **Arus Kas Bulan Ini** memakai sumber yang sama dengan Keuangan untuk toko dan bulan berjalan (WIB). Aksesnya memerlukan izin membaca pemasukan dan pengeluaran.

- **Arus Kas Bersih** adalah Pemasukan dikurangi Pengeluaran. Jika pengeluaran lebih besar, panel menunjukkan angka negatif beserta keterangannya.
- Garis Pemasukan dan Pengeluaran memakai skala yang sama, dari nol hingga nilai terbesar di antara keduanya.
- **Beban pengeluaran** dihitung dengan membagi total pengeluaran dengan total pemasukan. Persentase dapat melebihi 100% bila pengeluaran lebih besar.
- **Komponen pengeluaran terbesar** menampilkan nominal dan porsinya terhadap total pengeluaran. Giro jatuh tempo menjumlahkan bagian dengan pembayaran tercatat dan bagian yang masih tersisa.
- **Lihat cara perhitungan** menampilkan rumus dan nominal tiap komponen. Nilai Giro masuk pada tanggal jatuh tempo (WIB), termasuk bagian yang dibayar lebih awal.
- Jika riwayat pengeluaran belum lengkap, panel menandai total pengeluaran dan arus kas sebagai **Belum tersedia**. Rincian tetap menampilkan nominal yang sudah diketahui.
- **Lihat riwayat pengeluaran** membuka bagian Pengeluaran di Keuangan pada bulan yang sama jika pengguna mempunyai akses ke halaman tersebut.
- Ikon informasi pada **Beban pengeluaran** dan **Komponen pengeluaran terbesar** menampilkan rumus dengan nominal yang dipakai.
- **Saldo Hutang Pemasok** menjumlahkan sisa Giro Pembelian dan hutang manual per tanggal yang tertera (WIB). Sisa Giro memakai pembayaran efektif sampai tanggal tersebut serta kredit yang diterapkan. Hutang manual mengikuti pelunasan otomatis pada jatuh tempo seperti di Keuangan. Jika ada saldo Giro yang belum diketahui, total tampil sebagai **Saldo belum lengkap** dan subtotal yang diketahui tetap terlihat.
- **Lihat rincian hutang** membuka Hutang Pemasok di Keuangan. Ringkasan saldo tersedia bagi pengguna dengan akses halaman Keuangan dan izin baca giro serta hutang manual, selain izin melihat Arus Kas Bulan Ini.
