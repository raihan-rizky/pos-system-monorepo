# Keuangan (Arus Kas & Pengeluaran)

## Pemasukan tanpa transaksi

1. Di bagian **Pemasukan tanpa transaksi**, klik **Tambah Pemasukan**.
2. Isi tanggal, keterangan / sumber, nominal, serta kategori RC: **ATK, Cetak, Spanduk, Print, Stempel**. Pilih metode pembayaran dan pastikan jumlah seluruh metode sesuai nominal. Klik **Simpan**.
3. Catatan masuk ringkasan, grafik, arus kas, dan kolom kategori pada sheet **RC {BULAN}** di Excel bulanan. Jumlah transaksi tetap terpisah dari jumlah catatan manual.

Gunakan **Ubah** atau **Hapus** sesuai izin untuk koreksi. Tanggal harus valid, dalam lima tahun terakhir sampai hari ini menurut WIB. Nominal harus positif, maksimal Rp9.999.999.999,99 dengan dua angka desimal. **Unduh ulang Excel** setelah perubahan; file yang sudah diunduh tidak berubah otomatis.

## Belanja manual via transfer

1. Pada bagian **Pengeluaran**, klik **Tambah Belanja Transfer**.
2. Isi tanggal transfer, nama penerima / supplier, keterangan, nominal, dan kategori laporan. Bukti transfer opsional; pilih **Lepaskan foto** jika foto yang baru diunggah tidak jadi digunakan.
3. Klik **Simpan**. Catatan menampilkan badge **Belanja Transfer Manual** dan dapat diubah atau dihapus sesuai izin. Fitur ini hanya mencatat keuangan, tanpa menambah stok.

Jika transfer membayar hutang, pada **Bayar hutang dengan transfer ini** pilih hutang dan pembayaran pada tanggal transfer, atau catat pembayaran baru. Tambahkan alokasi untuk setiap hutang. Alokasi mengikuti kategori masing-masing hutang; sisa transfer mengikuti kategori transfer. Catatan lama perlu dihubungkan secara eksplisit. Pada Excel bulanan, pengeluaran masuk **PENGELUARAN BELANJA → VIA TRANSFER** serta RP dan dihitung satu kali. Mengubah transfer dan mengelola alokasi memerlukan izin khusus yang awalnya diberikan kepada Owner; Owner dapat memberikan izin tersebut melalui RBAC.

Jika hasil penyimpanan transfer belum pasti, buka lagi formulir dengan akun dan toko yang sama. Pilih **Coba lagi transfer sebelumnya** untuk memastikan hasilnya, atau **Catat transfer baru** jika itu pembayaran yang berbeda. Pembayaran awal dan pembayaran baru memerlukan izin melihat serta mencatat pembayaran hutang; perubahan yang mengubah pelunasan otomatis juga memerlukan izin koreksi pembayaran.

## Lokasi dan Fungsi

Buka sidebar **Keuangan > Keuangan** (`/keuangan`) untuk memantau arus kas bulanan toko. Halaman ini menyediakan:

- **Net Cash Flow:** Ringkasan bersih arus kas masuk dan keluar, termasuk pelunasan piutang manual.
- **Grafik Pemasukan vs Pengeluaran:** Visualisasi harian untuk membandingkan uang masuk dan uang keluar.
- **Pemasukan dari Transaksi:** Total mengikuti tanggal penerimaan seperti Sales. Pilih baris harian untuk melihat Riwayat penerimaan jika izin tersedia, termasuk pelunasan nota lama.
- **Daftar Pengeluaran:** Catatan pengeluaran operasional toko yang dikelompokkan per kategori (misal: sewa, listrik, gaji, operasional, dll).
- **Sumber Pengeluaran:** Badge **Manual** menandai entri dari form. Badge **Pembelian Barang** menandai entri otomatis baru, sedangkan **Daftar Belanja (Legacy)** hanya untuk data lama.
- **Pengeluaran Otomatis:** Nominal memakai jumlah dan harga yang disetujui pada Pembelian Barang, berkategori Bahan, dan tercatat saat penerimaan pertama yang berisi barang disetujui. Untuk koreksi, buka menu tiga titik pada baris pengeluaran. Pilih **Ubah pembelian** atau **Batalkan pembelian** untuk dokumen sumber, atau gunakan tindakan pembayaran pada baris pembayaran. Isi alasan dan tinjau dampaknya sebelum konfirmasi.
- **Update HPP:** Jika harga terbaru berbeda dari HPP master, pilihan update HPP diputuskan per produk. Snapshot nilai pengeluaran tetap memakai data final Pembelian Barang.
- **Hutang Pemasok:** Pilih **Tambahkan Hutang**, lalu isi pemasok, nominal, tanggal dan kategori laporan. Pembayaran awal dan jatuh tempo opsional. Pilih **Catat pembayaran** untuk cicilan atau pelunasan selama masih ada sisa. Saat jatuh tempo dalam WIB, sisa hutang tampil sebagai pelunasan bertanda **Otomatis**, termasuk untuk hutang lama. Pembayaran manual memakai tanggal pembayaran aktual. Hutang tanpa jatuh tempo tetap terbuka sampai dibayar. Pengeluaran mengikuti tanggal dan kategori masing-masing pembayaran. Pilih **Ubah hutang** atau **Ubah pembayaran** untuk koreksi sesuai izin.
- **Giro Pembelian:** Giro lama berstatus **Belum diketahui** sampai pengguna memilih **Periksa riwayat**, menghubungkan hutang manual yang sesuai bila ada, melengkapi pembayaran sebelumnya dan mengonfirmasi riwayat lengkap. Keuangan menampilkan pengeluaran giro pada bulan jatuh tempo terbaru, mulai tanggal jatuh tempo dalam WIB. Kartu menampilkan sisa hari ini, pembayaran tercatat per metode yang dipakai untuk menghitung saldo, dan nominal Giro terjadwal beserta jatuh tempo. Jika jadwal perlu dicocokkan, pengguna berizin koreksi dapat memilih **Periksa jadwal** atau **Ubah pembayaran** untuk mengganti Transfer atau Giro dan meninjau dampaknya. Sisa berlaku sampai hari ini; pembayaran yang tercatat untuk tanggal mendatang ditampilkan terpisah dan otomatis mengurangi sisa pada tanggalnya. Periksa **Maksimal pembayaran baru** agar pembayaran mendatang tidak dicatat dua kali. Untuk giro yang sudah diperiksa, pilih **Catat pembayaran** untuk menyimpan pembayaran sebagian atau lunas. Jika hasil belum pasti, gunakan **Pastikan pembayaran** pada peramban dan akun yang sama. Jika data peramban terhapus, periksa riwayat sebelum mencatat lagi. Pada Excel bulanan, kas mengikuti pembayaran aktual giro pada tanggal dibayar. Jika saldo belum diketahui, ringkasan yang terdampak diberi tanda belum lengkap.
- **Hubungkan hutang manual:** Untuk giro yang sudah diperiksa, pilih **Hubungkan hutang manual** lalu pilih hutang yang benar-benar sama dan bernominal sama. Periksa catatan kedua hutang, riwayat pembayaran, dan bukti, tentukan setiap pembayaran yang cocok sebagai pembayaran yang sama atau transaksi berbeda, lalu centang konfirmasi dan simpan. Pembayaran yang sama dihitung sekali dan catatan kedua hutang disimpan pada giro. Pembayaran yang dipindahkan masuk arus kas giro pada tanggal aslinya; periksa pengeluaran manual agar tidak tercatat dua kali.

## Mengelola Pengeluaran & Bukti Transaksi
- **Pencatatan Pengeluaran:** Catat nominal, pilih kategori, dan masukkan pengeluaran operasional toko. Untuk kategori baru, pilih **Tambah kategori**, isi nama, dan klik **Simpan kategori**. Kategori tersimpan dapat dipilih kembali atau digunakan pada **Filter kategori**. Langkah selengkapnya dibahas di FAQ.
- **Mengunggah Bukti Pengeluaran:** Klik **Pilih gambar bukti** untuk mengunggah foto nota langsung ke R2. Jika penyimpanan R2 gagal, gunakan input prnt.sc yang muncul sebagai fallback. Langkah detail dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q20-bagaimana-cara-mencatat-pengeluaran-operasional-toko).

## Hak Akses (Role-Based Access Control)
Akses ke menu Keuangan dan tindakan pengeluaran disesuaikan dengan peran pengguna (RBAC). Biasanya dibatasi hanya untuk Owner dan Admin.

Izin ubah rincian piutang, pembayaran piutang, rincian hutang, pembayaran hutang, transfer, dan alokasi transfer diatur secara terpisah. Awalnya izin tersebut hanya untuk Owner; role lain dapat diberi izin sesuai tugasnya. Data lama tanpa kategori tetap dihitung dan dapat diberi kategori melalui aksi Ubah.
