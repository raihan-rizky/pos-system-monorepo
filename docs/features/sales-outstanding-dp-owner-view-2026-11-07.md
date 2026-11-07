# Outstanding DP Sales dan pratinjau Owner

Sales dapat melihat Outstanding DP di Laporan Keuangan dengan izin `financial-report.daily-outstanding-dp:read`. Izin ini aktif secara default untuk Admin dan Sales serta dapat diatur terpisah di Hak Akses. Migrasi `20261107010000_daily_outstanding_dp_permission` menambah izin tanpa menimpa pengaturan tersimpan.

Total Pemasukan tetap memakai uang diterima pada tanggal pilihan WIB. Outstanding DP memakai sisa pembayaran terkini dari nota DP yang dibuat sebelum akhir tanggal pilihan, tidak termasuk Tempo. Angka ini bukan rekonstruksi saldo historis. Nota Rp50.000 dengan DP Rp25.000 menghasilkan pemasukan Rp25.000 dan sisa DP Rp25.000.

Owner membuka Laporan Keuangan, memilih Lihat sebagai Sales, lalu memeriksa tampilan sesuai izin Sales yang tersimpan. Jika Sales diberi laporan penuh, pratinjau juga menampilkan laporan penuh. Pilih Laporan Lengkap untuk kembali. Pratinjau hanya membaca data; hak akses tidak berubah.

Endpoint memeriksa izin halaman dan resource di server serta membatasi parameter pratinjau untuk Owner. Cache dipisah per akun, toko, versi izin, tanggal, dan mode.
