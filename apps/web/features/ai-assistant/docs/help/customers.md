# Pelanggan

## Lokasi dan fungsi

Buka sidebar **Pelanggan > Pelanggan** (`/customers`). Halaman ini menyediakan:

- **Rekap Pelanggan** dengan periode Bulan ini, 30 hari, 90 hari, Tahun ini, atau rentang tanggal manual. Rekap menampilkan ringkasan aktivitas, piutang, tren, komposisi tipe pelanggan, dan pelanggan dengan belanja tertinggi.
- Tab **Semua Pelanggan** untuk mencari berdasarkan nama, nomor HP, email, atau perusahaan serta memfilter tipe UMUM, AGEN, INDUSTRI, dan PEMERINTAH.
- Tab **Piutang** untuk melihat invoice DP/Tempo serta bagian **Piutang Manual** untuk utang lama atau tagihan di luar kasir.

## Mengelola pelanggan

Gunakan **Tambah Pelanggan** atau **Import Excel** bila role memiliki permission `customer.create`. Nama pelanggan wajib diisi. Tipe pelanggan default adalah UMUM dan dapat diganti; nomor HP/WhatsApp, email, perusahaan/instansi, alamat, dan catatan bersifat opsional.

Klik kartu pelanggan untuk membuka detail. Detail berisi total belanja, jumlah transaksi, piutang, rekap 7/14/30 hari, produk teratas, riwayat transaksi, dan **Piutang Manual**. Tombol **Ubah Profil** dan pembayaran memerlukan permission `customer.update`. **Bayar Piutang** pada transaksi mencatat pembayaran invoice DP/Tempo; **Bayar Piutang Manual** mencatat pembayaran catatan manual yang dipilih.

## Piutang manual

Gunakan **Piutang Manual** untuk utang lama atau tagihan di luar kasir. Pencatatan ini tidak membuat transaksi penjualan, order, atau mengubah stok. Melihat catatan memerlukan `customer.read`; menambah dan membayar memerlukan `customer.update`.

Pelanggan yang memiliki riwayat piutang manual tidak dapat dihapus, termasuk yang sudah lunas. Riwayat piutang dan pembayaran tetap tersimpan.

1. Buka detail pelanggan yang sudah terdaftar, lalu klik **Tambah Piutang** di bagian **Piutang Manual**. Pelanggan mengikuti profil yang dibuka.
2. Isi **Nominal piutang** lebih dari nol, **Tanggal utang** paling lambat hari ini dalam WIB, dan **Tanggal jatuh tempo** sama dengan atau setelah tanggal utang. **Catatan** bersifat opsional.
3. Klik **Simpan Piutang**. Catatan muncul di detail pelanggan dan bagian **Piutang Manual** pada tab **Piutang**.
4. Klik **Bayar Piutang Manual** pada catatan yang dituju. Isi **Nominal pembayaran** lebih dari nol hingga maksimal sisa piutang dan pilih satu metode: **Tunai**, **Debit**, **Kartu Kredit**, **QRIS**, atau **Transfer**. Tambahkan catatan bila perlu, lalu klik **Simpan Pembayaran**.
5. Buka **Riwayat pembayaran** untuk memeriksa pembayaran sebagian maupun pelunasan. Filter **Belum lunas** menampilkan tagihan terbuka; pilih **Semua piutang** untuk melihat juga catatan yang sudah lunas.

Tombol tambah, edit, hapus, import, dan bayar piutang dapat tidak muncul jika role tidak memiliki permission yang sesuai. Akses halaman dan aksi ditentukan oleh RBAC backend.

## Daftar Transaksi Piutang (Tab Piutang)

Tab **Piutang** pada menu Pelanggan menampilkan daftar invoice/transaksi penjualan DP atau Tempo, serta bagian **Piutang Manual** tersendiri. Filter dan pembayaran masing-masing bagian mengikuti jenis piutangnya.

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
Pembayaran invoice dapat diproses langsung dari kolom Aksi pada tab Piutang dan dapat memakai beberapa metode. Piutang manual memakai **Bayar Piutang Manual** dengan satu metode setiap pembayaran. Lihat [FAQ Q15](faq.md#q15-bagaimana-cara-mencatat-pembayaran-cicilan-atau-pelunasan-piutang-pelanggan).

## Kemampuan Pak Teladan

Pak Teladan dapat mencari pelanggan serta mengecek piutang atau rekap 30 hari untuk **satu pelanggan yang spesifik** bagi role OWNER, ADMIN, dan SALES. Jika nama tidak unik, Pak Teladan harus meminta pengguna memilih kandidat. Angka pelanggan dan piutang tidak boleh ditebak.

Pak Teladan juga dapat membuka modal **Tambah Pelanggan** dan mengekspor rekap pelanggan memakai fitur ekspor halaman ini. Jika periode atau format tidak disebutkan, ekspor memakai **30 hari terakhir** dan **PDF**. Pak Teladan tidak mengisi, menyimpan, mengubah, menghapus, atau membayar piutang secara otomatis; pengguna tetap memeriksa dan mengonfirmasi form.

Saat ekspor rekap semua pelanggan diminta melalui chat, file tidak diunduh otomatis. Klik **Download PDF/Excel** pada kartu; setelah berhasil tombol berubah menjadi **Download ulang** dan saran memakai dataset yang sama. Role OWNER juga memiliki quick prompt **Rekap pelanggan bulanan**.
