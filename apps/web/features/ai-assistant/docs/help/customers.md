# Pelanggan

## Lokasi dan fungsi

Buka sidebar **Pelanggan > Pelanggan** (`/customers`). Halaman ini menyediakan:

- **Rekap Pelanggan** dengan periode Bulan ini, 30 hari, 90 hari, Tahun ini, atau rentang tanggal manual. Rekap menampilkan ringkasan aktivitas, piutang, tren, komposisi tipe pelanggan, dan pelanggan dengan belanja tertinggi.
- Tab **Semua Pelanggan** untuk mencari berdasarkan nama, nomor HP, email, atau perusahaan serta memfilter tipe UMUM, AGEN, INDUSTRI, dan PEMERINTAH.
- Tab **Piutang** untuk melihat transaksi DP yang masih memiliki sisa tagihan.

## Mengelola pelanggan

Gunakan **Tambah Pelanggan** atau **Import Excel** bila role memiliki permission `customer.create`. Nama pelanggan wajib diisi. Tipe pelanggan default adalah UMUM dan dapat diganti; nomor HP/WhatsApp, email, perusahaan/instansi, alamat, dan catatan bersifat opsional.

Klik kartu pelanggan untuk membuka detail. Detail berisi total belanja, jumlah transaksi, piutang, rekap 7/14/30 hari, produk teratas, dan riwayat transaksi. Tombol **Ubah Profil** memerlukan permission update. Tombol **Bayar Piutang** hanya muncul untuk pelanggan yang memiliki piutang dan mencatat pembayaran ke transaksi DP terkait; tindakan ini juga memerlukan permission update.

Tombol tambah, edit, hapus, import, dan bayar piutang dapat tidak muncul jika role tidak memiliki permission yang sesuai. Akses halaman dan aksi ditentukan oleh RBAC backend.

## Daftar Transaksi Piutang (Tab Piutang)

Tab **Piutang** pada menu Pelanggan berfungsi khusus untuk memantau dan memproses seluruh invoice/transaksi penjualan tempo (DP) yang memiliki sisa tagihan.

### Informasi yang Ditampilkan:
- **Pelanggan:** Nama pelanggan terkait (bisa diklik untuk memfilter daftar hanya untuk pelanggan tersebut).
- **Invoice & Waktu:** Nomor invoice transaksi beserta tanggal transaksi dibuat. Anda juga bisa menekan tombol **Lihat** untuk memunculkan struk belanja secara lengkap.
- **Tagihan & Sisa:** Total nominal transaksi, sisa tagihan yang harus dibayar, serta jumlah yang telah dibayarkan (DP).
- **Status & Usia Tagihan:** Status pembayaran (Belum Lunas / Lunas) dan berapa hari tagihan tersebut berjalan (Usia Tagihan).

### Fitur Pencarian & Filter:
- **Pencarian:** Cari invoice berdasarkan nomor invoice atau nama pelanggan.
- **Filter Cepat:** Tombol filter instan (Harian, Mingguan, Bulanan, Tahunan).
- **Rentang Tanggal:** Masukkan filter tanggal **Dari** dan **Sampai** untuk mencari transaksi di periode tertentu.
- **Status Pembayaran:** Filter berdasarkan status pembayaran (Semua, Belum Lunas, atau Lunas).
- **Tipe Pelanggan:** Filter transaksi berdasarkan tipe akun pelanggan (UMUM, AGEN, INDUSTRI, PEMERINTAH).

### Proses Pembayaran Piutang:
Pembayaran piutang pelanggan dapat diproses langsung dari kolom Aksi pada tab Piutang. Langkah detail pengisian nominal dan metode pembayaran dapat dilihat di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q13-bagaimana-cara-mencatat-pembayaran-cicilan-atau-pelunasan-piutang-pelanggan).

## Kemampuan Pak Teladan

Pak Teladan dapat mencari pelanggan serta mengecek piutang atau rekap 30 hari untuk **satu pelanggan yang spesifik** bagi role OWNER, ADMIN, dan SALES. Jika nama tidak unik, Pak Teladan harus meminta pengguna memilih kandidat. Angka pelanggan dan piutang tidak boleh ditebak.

Pak Teladan juga dapat membuka modal **Tambah Pelanggan** dan mengekspor rekap pelanggan memakai fitur ekspor halaman ini. Jika periode atau format tidak disebutkan, ekspor memakai **30 hari terakhir** dan **PDF**. Pak Teladan tidak mengisi, menyimpan, mengubah, menghapus, atau membayar piutang secara otomatis; pengguna tetap memeriksa dan mengonfirmasi form.

Saat ekspor rekap semua pelanggan diminta melalui chat, file tidak diunduh otomatis. Klik **Download PDF/Excel** pada kartu; setelah berhasil tombol berubah menjadi **Download ulang** dan saran memakai dataset yang sama. Role OWNER juga memiliki quick prompt **Rekap pelanggan bulanan**.
