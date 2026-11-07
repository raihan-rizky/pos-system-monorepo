# Outstanding DP Sales dan pratinjau Owner

Sales dapat melihat Outstanding DP di Laporan Keuangan dengan izin `financial-report.daily-outstanding-dp:read`. Izin ini aktif secara default untuk Admin dan Sales serta dapat diatur terpisah di Hak Akses. Migrasi `20261107010000_daily_outstanding_dp_permission` menambah izin tanpa menimpa pengaturan tersimpan.

Total Pemasukan memakai nominal pembayaran, bukan harga penuh produk. Pembayaran awal/DP mengikuti tanggal nota tersimpan (`invoiceDate`) dalam WIB; pelunasan berikutnya mengikuti waktu pembayaran (`debtPaymentLogs.createdAt`). Nota yang dibuat hari ini lalu dipindahkan ke tanggal lain tidak menyumbang pembayaran awal ke pemasukan hari ini. Pelunasan nota lama tetap masuk pada hari pembayaran.

Outstanding DP memakai sisa pembayaran terkini dari nota DP bertanggal sebelum akhir tanggal pilihan, tidak termasuk Tempo atau nota bertanggal masa depan. Angka ini bukan rekonstruksi saldo historis. Nota Rp50.000 dengan DP Rp25.000 menghasilkan pemasukan Rp25.000 pada tanggal nota dan sisa DP Rp25.000.

Owner membuka Laporan Keuangan, memilih Lihat sebagai Sales, lalu memeriksa tampilan sesuai izin Sales yang tersimpan. Jika Sales diberi laporan penuh, pratinjau juga menampilkan laporan penuh. Pilih Laporan Lengkap untuk kembali. Pratinjau hanya membaca data; hak akses tidak berubah.

Endpoint memeriksa izin halaman dan resource di server serta membatasi parameter pratinjau untuk Owner. Cache dipisah per akun, toko, versi izin, tanggal, dan mode.

## Pemeriksaan publikasi

Gunakan Node 22 sesuai workflow GitHub untuk menjalankan test lokal. Test E2E laporan penuh memeriksa omzet, uang terkumpul, Laba Kotor, Outstanding DP, dan loss stok; kartu Laba Bersih (Estimasi) serta Margin yang sudah dihapus tidak diharapkan muncul. E2E Sales memeriksa sisa DP, sedangkan E2E Owner memeriksa pratinjau harian, parameter `view=sales`, fokus keyboard, dan kembali ke laporan lengkap pada lebar ponsel.

Regresi tanggal mencakup nota yang dipindah ke kemarin/besok, batas tengah malam WIB, pembayaran awal tanpa baris payment, rincian kategori/metode yang tetap seimbang, serta pelunasan hari ini untuk nota bertanggal sebelumnya. Query tetap dibatasi toko pengguna dan memuat ledger lengkap untuk alokasi kembalian/refund.
