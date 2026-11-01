# Keuangan (Arus Kas & Pengeluaran)

## Lokasi dan Fungsi

Buka sidebar **Keuangan > Keuangan** (`/keuangan`) untuk memantau arus kas bulanan toko. Halaman ini menyediakan:

- **Net Cash Flow:** Ringkasan bersih arus kas masuk dan keluar.
- **Grafik Pemasukan vs Pengeluaran:** Visualisasi harian untuk membandingkan uang masuk dan uang keluar.
- **Pemasukan dari Transaksi:** Total nominal yang diterima dari transaksi penjualan yang terjadi.
- **Daftar Pengeluaran:** Catatan pengeluaran operasional toko yang dikelompokkan per kategori (misal: sewa, listrik, gaji, operasional, dll).
- **Sumber Pengeluaran:** Badge **Manual** menandai entri dari form. Badge **Pembelian Barang** menandai entri otomatis baru, sedangkan **Daftar Belanja (Legacy)** hanya untuk data lama.
- **Pengeluaran Otomatis:** Nominal memakai jumlah dan harga yang disetujui pada Pembelian Barang, berkategori Bahan, dan tercatat saat penerimaan pertama yang berisi barang disetujui. Entri ini tidak dapat diedit, dihapus, atau diubah lampirannya dari halaman Keuangan.
- **Update HPP:** Jika harga terbaru berbeda dari HPP master, pilihan update HPP diputuskan per produk. Snapshot nilai pengeluaran tetap memakai data final Pembelian Barang.
- **Hutang Pemasok:** Catat pemasok, nominal, dan tanggal lewat **Tambahkan Hutang**. Pembayaran awal opsional; pilih **Catat pembayaran** untuk pembayaran sebagian atau pelunasan. Pembayaran hutang manual dicatat terpisah dari pengeluaran. Saldo yang dicatat masuk laporan bulanan sesuai tanggal.
- **Giro Pembelian:** Giro lama berstatus **Belum diketahui** sampai pengguna memilih **Periksa riwayat**, menghubungkan hutang manual yang sesuai bila ada, melengkapi pembayaran sebelumnya dan mengonfirmasi riwayat lengkap. Untuk giro yang sudah diperiksa, pilih **Catat pembayaran** untuk menyimpan pembayaran sebagian atau lunas. Jika hasil belum pasti, gunakan **Pastikan pembayaran** pada peramban dan akun yang sama. Jika data peramban terhapus, periksa riwayat sebelum mencatat lagi. Pembayaran aktual giro mengurangi kas pada tanggal pembayarannya; saldo belum diketahui membuat ringkasan yang terdampak belum lengkap.
- **Hubungkan hutang manual:** Untuk giro yang sudah diperiksa, pilih **Hubungkan hutang manual** lalu pilih hutang yang benar-benar sama dan bernominal sama. Periksa catatan kedua hutang, riwayat pembayaran, dan bukti, tentukan setiap pembayaran yang cocok sebagai pembayaran yang sama atau transaksi berbeda, lalu centang konfirmasi dan simpan. Pembayaran yang sama dihitung sekali dan catatan kedua hutang disimpan pada giro. Pembayaran yang dipindahkan masuk arus kas giro pada tanggal aslinya; periksa pengeluaran manual agar tidak tercatat dua kali.

## Mengelola Pengeluaran & Bukti Transaksi
- **Pencatatan Pengeluaran:** Catat nominal, pilih kategori, dan masukkan pengeluaran operasional toko. Untuk kategori baru, pilih **Tambah kategori**, isi nama, dan klik **Simpan kategori**. Kategori tersimpan dapat dipilih kembali atau digunakan pada **Filter kategori**. Langkah selengkapnya dibahas di FAQ.
- **Mengunggah Bukti Pengeluaran:** Klik **Pilih gambar bukti** untuk mengunggah foto nota langsung ke R2. Jika penyimpanan R2 gagal, gunakan input prnt.sc yang muncul sebagai fallback. Langkah detail dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q20-bagaimana-cara-mencatat-pengeluaran-operasional-toko).

## Hak Akses (Role-Based Access Control)
Akses ke menu Keuangan dan tindakan pengeluaran disesuaikan dengan peran pengguna (RBAC). Biasanya dibatasi hanya untuk Owner dan Admin.
