# Hapus dan Void untuk Semua Jenis Transaksi

Tanggal: 2026-11-05 (Asia/Jakarta)
Status: Desain disetujui; menunggu tinjauan spesifikasi tertulis.

## Keputusan yang sudah disetujui

- Gunakan proses pembatalan dan penghapusan transaksi yang terpusat.
- Aksi pada transaksi berlaku untuk seluruh surat jalan yang terkait dengannya.
- Masalah riwayat stok nota penawaran menjadi peringatan yang tidak menghalangi penghapusan.
- Dokumentasi disimpan di `C:\Projects\pos-system-monorepo\markdown-files`, sesuai persetujuan pengguna karena drive D: tidak tersedia.

## Temuan

- `TransactionActionMenu` menyembunyikan Hapus dan Void ketika transaksi memiliki surat jalan.
- Riwayat transaksi juga menyembunyikan Hapus untuk transaksi percetakan tertentu.
- Layanan `reverseTransaction` menolak DELETE ketika ada surat jalan dan menolak VOID ketika ada surat jalan berstatus PENDING.
- Pemeriksaan bukti stok mencakup status VOIDED. Nota penawaran yang dibatalkan melalui `cancel-draft` dapat berstatus VOIDED walaupun belum pernah mengurangi stok dan belum memiliki invoice.
- Penghapusan item transaksi harus dilakukan setelah item surat jalan yang merujuk kepadanya dihapus.

## Perilaku yang dituju

### Akses tindakan

- Semua jenis transaksi pada Riwayat, termasuk ATK, percetakan, nota penawaran, dan transaksi dengan surat jalan, menyediakan Hapus dan Void sesuai izin akun serta status yang memenuhi syarat.
- Hapus tersedia pada seluruh status yang dapat dihapus oleh izin akun.
- Void tersedia bagi transaksi aktif dan yang belum disetujui, termasuk nota penawaran. Transaksi VOIDED atau REFUNDED tidak menawarkan pembatalan ulang.
- Tampilan desktop dan ponsel menggunakan aturan yang sama.
- Hak akses yang sudah berlaku tetap diperiksa di server. Pembatasan berdasarkan jenis transaksi atau kepemilikan surat jalan dihapus.
- Void menggunakan `transaction.update`, sedangkan Hapus menggunakan `transaction.delete`; kedua izin diperiksa secara terpisah pada UI dan API. Grant yang dikonfigurasi berlaku untuk setiap role, termasuk Kasir dan Sales.
- Pratinjau aktivitas RBAC menjelaskan kebutuhan akses `/history` dan `transaction.read` untuk menemukan transaksi, serta izin tindakan yang dipilih. Izin persetujuan transaksi tetap mempunyai fungsi tersendiri.

### Void dan surat jalan

- Transaksi berubah menjadi VOIDED.
- Surat jalan PENDING dan CONFIRMED yang terkait berubah menjadi CANCELLED dengan waktu pembatalan.
- Surat jalan yang sebelumnya CANCELLED atau REJECTED mempertahankan statusnya.
- Seluruh perubahan berjalan dalam satu transaksi database dan memakai penguncian transaksi yang sudah ada.
- Mutasi stok dibalik berdasarkan stok bersih yang masih perlu dikembalikan. Membatalkan transaksi tidak boleh mengembalikan stok dua kali, termasuk saat ada beberapa surat jalan atau permintaan berulang.
- Draft/nota penawaran yang belum dikonversi tidak mempunyai kontribusi keuangan yang harus dibalik.

### Hapus dan surat jalan

- Penghapusan meliputi transaksi, seluruh surat jalan terkait, dan item dokumennya.
- Sebelum dokumen dihapus, stok yang terbukti sudah keluar dikembalikan paling banyak satu kali.
- Jurnal stok dan audit siklus transaksi tetap menyimpan referensi sumber serta snapshot dokumen yang dihapus.
- Hapus setelah Void tidak boleh mengembalikan stok lagi.
- Konfirmasi menyebutkan bahwa seluruh surat jalan terkait ikut dihapus atau dibatalkan.

### Peringatan stok nota penawaran

- Nota penawaran yang belum menjadi invoice dikenali dari data transaksi, bukan awalan nomor yang dapat diubah pengguna. Nota penawaran yang sudah dibatalkan juga tercakup.
- Penghapusan nota penawaran tidak gagal hanya karena bukti stoknya kosong atau membutuhkan pemeriksaan.
- Jika stok tidak dapat dipastikan, tampilkan peringatan berbahasa Indonesia dan izinkan pengguna melanjutkan penghapusan. Tidak ada tambahan stok berdasarkan perkiraan jumlah item.
- Peringatan dan kebutuhan pemeriksaan disimpan dalam audit. Respons API meneruskan peringatan agar pengguna tetap mengetahuinya setelah tindakan berhasil.
- Jika bukti mutasi valid tersedia, pembalikan stok tetap mengikuti bukti tersebut.
- Nota penawaran yang sudah dikonversi menjadi invoice mengikuti aturan invoice dan jurnal stoknya.
- Konflik izin, perubahan bersamaan, dan kegagalan database tetap ditangani sebagai kesalahan yang sesuai.

## Rancangan teknis

- Pertahankan `reverseTransaction` sebagai titik bersama untuk VOID dan DELETE, lalu tambahkan penanganan surat jalan serta hasil peringatan yang terstruktur.
- Pastikan pembatalan draft menggunakan aturan yang sesuai tanpa memperluas izin akun.
- Hapus pembatasan `isBundled` pada kedua aksi destruktif dan pembatasan jenis percetakan pada Hapus.
- Sesuaikan modal konfirmasi dan hook mutasi agar pesan stok cocok dengan tindakan serta peringatan sukses tetap terlihat.
- Gunakan skema relasi yang sudah ada; tidak menambahkan dependensi atau migrasi kecuali ditemukan kebutuhan yang harus dijelaskan terlebih dahulu.

## Verifikasi dengan TDD

1. Tulis dan jalankan tes gagal untuk tombol Hapus/Void pada transaksi dengan surat jalan dan percetakan, di kedua susunan Riwayat.
2. Tulis tes layanan/API untuk Void dengan surat jalan PENDING/CONFIRMED, penghapusan dokumen terkait dalam urutan relasi yang benar, dan pemeliharaan audit.
3. Tulis tes untuk nota penawaran yang belum dikonversi dan yang telah dibatalkan: penghapusan berhasil dengan peringatan yang sesuai tanpa mengarang pengembalian stok.
4. Uji stok milik transaksi dan stok legacy milik surat jalan, beberapa pengiriman, Void berulang, serta Hapus setelah Void.
5. Uji penolakan tanpa izin dan validasi status terminal.
6. Jalankan tes terkait, lint pada berkas yang berubah, dan pemeriksaan TypeScript. Pemeriksaan browser memakai server yang dikelola pengguna bila tersedia.

## Dokumentasi dan catatan rilis

- Perbarui Bantuan untuk alur Hapus/Void dan surat jalan terkait.
- Perbarui katalog workflow AI Assistant untuk petunjuk tindakan serta peringatan nota penawaran.
- Tambahkan Catatan Perubahan dengan tanggal WIB yang sebenarnya, id stabil, revision, tiga langkah penggunaan, dan highlight sesuai batas karakter.
- Gunakan ilustrasi yang diberi label secara akurat jika tangkapan layar tanpa data sensitif belum tersedia.

## Catatan pelaksanaan

- Jangan menjalankan production build atau mengubah siklus hidup server development.
- Repositori sudah memiliki banyak perubahan lokal. Pertahankan seluruh perubahan yang bukan bagian tugas ini dan gunakan perbandingan terhadap kondisi awal untuk meninjau perubahan tugas.
- Headroom MCP dipanggil; proksi kompresinya tidak terhubung. Gunakan keluaran perintah yang dibatasi dan jangan mengirim kredensial.
- Serena sempat terdaftar tetapi alat initial_instructions tidak tersedia saat hendak dipanggil.
- Indeks GitNexus terdeteksi stale, pencarian FTS terdegradasi, dan percobaan pembaruan pertama berhenti dengan exit code 1. Pemeriksaan impact wajib dilakukan sebelum mengubah simbol; keterbatasan indeks harus dilaporkan.
