# Rancangan: Koreksi Daftar Belanja

Tanggal: 2026-11-06 (WIB)

Status: Disetujui

## Tujuan

Pengguna dapat memperbaiki daftar belanja dan pembelian terkait secara langsung, termasuk setelah barang diterima. Perubahan yang memengaruhi barang, stok, harga, dan keuangan harus konsisten, dapat ditelusuri, dan terlihat oleh pengguna lain. Izin koreksi secara bawaan hanya dimiliki Owner.

## Pendekatan

1. **Koreksi langsung — dipilih.** Pengguna meninjau dampak dan menyimpan; penyesuaian stok dan keuangan diterapkan bersama perubahan daftar. Cara ini cepat dan memerlukan validasi serta transaksi yang ketat.
2. **Koreksi dengan persetujuan Owner.** Pengguna membuat pengajuan dan Owner menyetujuinya sebelum dampak diterapkan. Cara ini menambah pemeriksaan, tetapi membutuhkan antrean dan memperlambat koreksi.

## Cakupan dan hak akses

- Tindakan **Edit daftar** tersedia melalui **Tindakan lainnya** pada daftar aktif, baik sebelum diproses, setelah disetujui, saat diterima sebagian, maupun setelah seluruh barang diterima. Arsip daftar yang sudah dibatalkan tetap terkunci. Belanja Terdahulu adalah jenis catatan berbeda dan tidak termasuk rancangan ini.
- Formulir mendukung koreksi data usaha pada daftar dan pembelian terkait: nama dan nomor yang ditampilkan, pemasok, tanggal usaha yang ditampilkan, pemohon, catatan, produk, satuan, jumlah kebutuhan, jumlah yang disetujui/dipesan, jumlah diterima per penerimaan, harga beli, metode dan jatuh tempo pembayaran, serta rincian pembayaran yang tercatat. Pengguna dapat menambah dan menghapus barang. Total dan status penerimaan dihitung dari data yang benar; identitas internal, waktu kejadian audit, dan catatan audit bukan isian bebas.
- Koreksi daftar yang sudah diproses mempunyai izin RBAC tersendiri, bawaan Owner saja, agar role yang sebelumnya diberi izin mengedit daftar awal tidak otomatis memperoleh kemampuan mengubah stok dan keuangan. Izin dapat diberikan ke role lain melalui Hak Akses; keterangannya menjelaskan dampak stok, pembelian, keuangan, serta pilihan HPP dan harga jual. Akses halaman, toko, dan izin diperiksa ulang di server. Alur edit sebelum item diproses tetap mengikuti izin edit yang ada.
- Pengguna memasukkan alasan ketika koreksi mengubah stok, pembelian yang sudah diproses, atau keuangan. Formulir menampilkan data lama, usulan baru, dan dampaknya sebelum pengguna mengonfirmasi penyimpanan.

## Barang dan penerimaan

- Membedakan jumlah kebutuhan, jumlah yang dipesan, dan jumlah yang benar-benar diterima. Mengubah kebutuhan atau pesanan saja tidak menciptakan penerimaan atau mengubah stok secara otomatis.
- Ketika barang ditambahkan ke daftar yang sudah diterima, pengguna mengisi jumlah barang baru yang benar-benar telah diterima; jumlah ini boleh nol. Hanya jumlah yang dinyatakan telah diterima memengaruhi stok. Barang yang masih belum diterima mengikuti alur penerimaan yang ada.
- Barang yang pernah diterima dapat dikoreksi, diganti, atau dihapus. Pengguna dapat menentukan penerimaan mana yang dikoreksi jika terdapat beberapa penerimaan. Perubahan jumlah diterima menambahkan atau mengurangi stok sebesar selisih penerimaan yang benar-benar diterapkan; penghapusan atau penggantian memperhitungkan seluruh dampak penerimaan barang yang terkait. Jangan menganggap penghapusan baris yang belum diterima sebagai pengurangan stok.
- Simpan kejadian penerimaan asal dan catatan koreksinya. Perhitungan stok grup, satuan, dan konversi menggunakan dampak asal yang dapat ditelusuri; proyeksi varian tidak dihitung dua kali. Penerimaan yang masih menunggu persetujuan tidak boleh tanpa sengaja disetujui oleh koreksi. Status penerimaan dan sisa pesanan dihitung ulang setelah perubahan.
- Bila barang yang hendak diubah mempunyai penerimaan yang masih menunggu persetujuan, tahan koreksi sampai penerimaan tersebut ditangani. Ini menjaga pekerjaan penerimaan yang sedang berjalan.
- Jika pengurangan membuat stok negatif, data historis tidak cukup untuk menentukan dampak asal, konversi tidak lagi dapat dipetakan dengan pasti, atau ada konflik perubahan bersamaan, hentikan penyimpanan tanpa perubahan dan jelaskan tindakan yang diperlukan. Jangan menimpa stok terkini dengan snapshot lama.
- Pencatatan stok dan valuasi memakai mekanisme pergerakan/penyesuaian yang berlaku dan menghubungkan koreksi ke sumbernya. Pembatalan daftar yang telah dikoreksi hanya membalikkan dampak bersih yang masih berlaku; koreksi, penghapusan, dan undo tidak boleh membalikkan penerimaan dua kali.

## Harga dan keuangan

- Untuk daftar yang dikoreksi setelah penerimaan, total pembelian dan catatan keuangan berdasarkan jumlah yang benar-benar diterima, bukan jumlah yang dipesan; tampilkan dasar perhitungan ini kepada pengguna. Contoh: dipesan 10, diterima 7, maka total memakai 7. Pada penerimaan berikutnya, total dan keuangan diperbarui mengikuti tambahan barang yang diterima. Nilai pesanan yang belum diterima dapat ditampilkan sebagai perkiraan terpisah tanpa dihitung sebagai barang yang telah diterima.
- Perubahan barang, jumlah yang benar-benar diterima, dan harga beli memperbarui total pembelian serta catatan pengeluaran dan utang yang terkait sesuai data terkoreksi. Hitung nominal menggunakan presisi desimal yang berlaku; ringkasan menampilkan nilai sebelum dan sesudah serta tanggal laporan keuangan yang terdampak.
- Riwayat pembayaran yang benar-benar sudah dicatat tidak otomatis diubah hanya karena total pembelian dikoreksi. Jika total baru lebih kecil daripada pembayaran yang tercatat, tampilkan peringatan nominal kelebihan kepada pengguna dan catat kondisi tersebut di riwayat. Jangan menganggap kelebihan itu telah dikembalikan atau membuat transaksi pengembalian uang otomatis.
- Bila pengguna secara khusus mengoreksi rincian pembayaran, metode, tanggal, atau pemasok, catat data lama dan baru, perbarui saldo dan laporan terkait secara konsisten, dan pertahankan jejak pembayaran asal. Jangan membuat, menghapus, atau mengklaim perpindahan uang sungguhan secara implisit. Jika hubungan transaksi lama tidak dapat ditentukan dengan pasti, hentikan dan jelaskan perlunya pemeriksaan manual.
- Saat metode Transfer/Giro dikoreksi, pertahankan riwayat dan minta pengguna menentukan alokasi pembayaran yang telah tercatat. Alokasi harus dapat ditelusuri, tidak boleh menghitung satu pembayaran dua kali, dan tidak menyatakan adanya perpindahan uang baru.
- Perbarui laporan pada tanggal transaksi semula sehingga laporan periode lama ikut berubah. Tunjukkan periode dan dampaknya sebelum simpan.
- Ketika harga beli berubah, tampilkan pop-up yang menanyakan apakah HPP dan harga jual katalog juga perlu dikoreksi. Keduanya dipilih terpisah; apabila dipilih, pengguna mengisi dan meninjau nilai baru. Nilai katalog yang tidak dipilih tetap seperti semula. Perubahan katalog memakai validasi satuan dan grup serta riwayat harga yang berlaku, dan tidak menimpa perubahan baru yang terjadi sejak formulir dibuka.

## Tampilan dan riwayat

- Setelah koreksi, kartu menampilkan badge **Diubah**; jika koreksi pernah mengubah stok, tampilkan juga **Stok berubah**. Badge menyediakan akses ke riwayat. Harga yang dikoreksi dibedakan dengan warna dan label teks yang jelas; informasi tidak bergantung pada warna saja.
- **Riwayat perubahan** menampilkan pelaku, waktu, alasan, barang dan kolom yang berubah, nilai sebelum dan sesudah, dampak stok dan keuangan, serta peringatan kelebihan pembayaran jika ada. Penerimaan dan pembayaran asal tetap dapat diperiksa.
- Kirim notifikasi dalam aplikasi kepada Owner lain di toko yang sama saat daftar diubah, dengan tautan ke rincian perubahan. Pengguna yang memiliki akses dapat melihat badge dan riwayat pada daftar. Jangan menampilkan rincian lintas toko atau mengirim notifikasi kepada pelaku sendiri.
- Ikuti contoh tampilan yang ditinjau pengguna: tombol **Tambah barang** dan **Hapus barang** di formulir, ringkasan dampak sebelum simpan, dan pilihan HPP/harga jual secara terpisah. Pastikan formulir dan dialog dapat digunakan melalui keyboard dan pada layar kecil.

## Integritas dan penanganan kegagalan

- Simpan perubahan daftar, pembelian, penyesuaian stok dan valuasi, pengeluaran, utang, koreksi pembayaran yang dipilih, perubahan katalog yang dipilih, serta audit dalam satu transaksi yang konsisten. Kunci data yang relevan, periksa versi terkini, dan cegah penyimpanan ulang atau operasi bersamaan menghasilkan penyesuaian ganda.
- Jika salah satu langkah gagal, seluruh perubahan dibatalkan dan pengguna mendapat pesan yang dapat ditindaklanjuti. Identitas, relasi, dan catatan sumber tetap tersedia agar riwayat pembelian, penerimaan, pembatalan, dan laporan tetap dapat ditelusuri.
- Gunakan migrasi dan perlindungan data audit sesuai pola proyek. Detail penyimpanan dan strategi kunci ditentukan saat perencanaan berdasarkan struktur dan batasan database yang ada, dengan tetap memenuhi perilaku di atas.

## Pemeriksaan dan dokumentasi

Pemeriksaan mencakup izin dan isolasi toko; daftar baru, disetujui, diterima sebagian, dan diterima seluruhnya; tambah, hapus, ganti, dan ubah jumlah barang; penerimaan bertahap; stok tidak cukup; grup/satuan; data lama; koreksi dan pembatalan berurutan; harga dan pop-up katalog; utang dan pembayaran sebagian/lunas/berlebih; riwayat dan notifikasi; konkurensi serta pengulangan permintaan; dan keyboard/mobile. Gunakan TDD sesuai pedoman repositori.

Perbarui Bantuan, katalog workflow AI Assistant, Catatan Perubahan, dan dokumentasi fitur saat implementasi. Dokumentasi disimpan di folder `markdown-files` pada drive C: sesuai persetujuan pengguna.
