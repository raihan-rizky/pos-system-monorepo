# Excel bulanan mengikuti Keuangan

Ringkasan, rekap, dan rincian ekspor Excel bulanan memakai tanggal pencatatan yang sama dengan halaman Keuangan untuk toko dan periode WIB yang sama.

- Pembayaran awal nota dicatat pada tanggal nota. Pelunasan piutang memakai tanggal pembayaran.
- Giro dicatat pada tanggal jatuh tempo, termasuk yang dibayar lebih awal. Rincian belanja membedakan tanggal pencatatan dan tanggal bayar jika tersedia.
- Transfer dan kelebihan bayar masuk sesuai tanggal yang dipakai Keuangan. Ringkasan pengeluaran tetap kosong jika riwayat pengeluaran belum lengkap.
- Jadwal belanja di Excel tetap tersedia untuk pemeriksaan. Rumus rekap menjumlahkan rincian pengeluaran tercatat sehingga jadwal dan pengakuan giro tidak dihitung dua kali.

Untuk mencocokkan hasilnya, buka **Laporan Keuangan → Ekspor → Laporan bulanan**, pilih periode yang sama dengan **Keuangan**, lalu buka **LAP KEU** di Excel. Rincian harian dapat ditelusuri lewat **RC**, **RP**, dan **Pengeluaran Belanja**.
