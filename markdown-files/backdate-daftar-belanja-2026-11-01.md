# Belanja Terdahulu dan Pembayaran Bertahap

Tanggal: 2026-11-01 WIB

## Penggunaan

Di Supplier > Daftar Belanja, pilih **Catat Belanja Terdahulu**. Isi tanggal pembelian dari bulan sebelumnya, metode pembayaran (Giro secara default atau Transfer), tanggal jatuh tempo, nomor Giro atau transaksi, dan nominal pembelian. Pembayaran yang sudah dilakukan dapat ditambahkan bersama tanggal dan nominal masing-masing. Catatan ini tidak menambah barang atau mengubah stok.

Kartu menampilkan nominal awal, jumlah yang dibayar, sisa, dan status pembayaran. Gunakan filter jenis catatan, status pembayaran, metode, jatuh tempo, atau pencarian nomor. Pilih **Riwayat pembayaran** untuk menambahkan pembayaran berikutnya. Nominal pembayaran tidak boleh melampaui sisa tagihan.

## Pencatatan keuangan

Pembayaran pada atau sebelum jatuh tempo dicatat sebagai pengeluaran pada tanggal pembayaran. Sisa nominal yang belum dibayar pada jatuh tempo dicatat sebagai pengeluaran pada tanggal jatuh tempo dan baru ditampilkan ketika hari tersebut tiba di WIB. Pembayaran setelah jatuh tempo mengurangi saldo tagihan tanpa membuat pengeluaran kedua. Pembayaran bertanggal sebelum jatuh tempo yang dimasukkan belakangan menyesuaikan pengeluaran jatuh tempo.

Pengeluaran terkait diberi sumber **Belanja Terdahulu** dan tidak dapat diubah atau dihapus terpisah di Keuangan. Pencatatan awal memerlukan izin `supplier:create` dan `expense:create`; penambahan pembayaran memerlukan akses `supplier:read` dan `expense:update`.

## Penyimpanan

Migrasi `20261101010000_backdated_purchase_payments` menambahkan pembelian terdahulu, riwayat pembayaran, dan hubungan ke pengeluaran. Migrasi diterapkan dan diverifikasi pada database pengembangan dan produksi pada 2026-11-01 WIB. Pencatatan memakai transaksi database, penguncian baris, dan kunci permintaan untuk mencegah pembayaran berlebih atau duplikat.

Jika status penyimpanan belum pasti karena koneksi terputus, buka kembali formulir dalam tab browser yang sama dan simpan ulang dengan data yang tersedia. Permintaan yang sama digunakan kembali agar catatan tidak dibuat dua kali. Penyimpanan sementara browser harus tersedia saat mencatat pembelian atau pembayaran.

Pembacaan dan perubahan pengeluaran terkait dibatasi pada toko yang ditetapkan untuk pengguna. Pengguna tanpa toko mendapat respons akses ditolak.
