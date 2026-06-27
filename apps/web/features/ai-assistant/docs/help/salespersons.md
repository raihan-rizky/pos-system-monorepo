# Panduan Fitur Tim Sales (Salespersons)

Fitur Tim Sales digunakan untuk mengelola daftar anggota sales (tenaga penjual) yang dapat dipilih saat kasir (checkout) sedang memproses transaksi. Fitur ini membantu melacak kontribusi dan riwayat transaksi dari setiap anggota sales.

## Konsep Utama
- **Salesperson (Anggota Sales):** Staf yang membantu melayani pelanggan dan dicatat pada transaksi. 
- **Status Aktif/Nonaktif:** Hanya sales dengan status "Aktif" yang akan muncul sebagai pilihan di halaman kasir (checkout). Sales yang sudah tidak bekerja atau sedang tidak bertugas dapat diubah statusnya menjadi "Nonaktif".

## Fungsionalitas Utama
- **Statistik Tim Sales:** Menampilkan ringkasan berupa Total Sales terdaftar, Jumlah Sales Aktif, Total Transaksi yang melibatkan sales, dan Top Performer (Sales dengan jumlah transaksi terbanyak).
- **Daftar dan Pencarian:** Mencari sales berdasarkan nama atau memfilter daftar berdasarkan status (Semua, Aktif, Nonaktif).
- **Manajemen Sales:** 
  - **Tambah Sales:** Mendaftarkan nama anggota sales baru ke dalam sistem.
  - **Ubah Sales:** Mengubah nama atau mengatur status aktif/nonaktif dari sales yang ada (bisa melalui tombol toggle cepat di daftar).
- **Riwayat Transaksi Sales:** Dengan mengklik salah satu baris sales pada tabel (atau kartu pada versi mobile), Anda dapat melihat daftar maksimal 20 transaksi terbaru yang ditangani oleh sales tersebut, lengkap dengan nomor invoice, status bayar, pelanggan, dan nominal transaksi.

## Hak Akses (Role-Based Access Control)
- **Hanya Lihat:** Pengguna tanpa hak akses khusus hanya dapat melihat daftar sales dan riwayat transaksinya.
- **Tambah (Create):** Hak akses diperlukan untuk melihat dan menggunakan tombol "Tambah Sales".
- **Ubah (Update):** Hak akses diperlukan untuk mengedit nama atau mengubah status (toggle Aktif/Nonaktif) anggota sales.
