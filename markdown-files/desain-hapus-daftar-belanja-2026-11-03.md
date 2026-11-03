# Rancangan: Hapus Daftar Belanja

Tanggal: 2026-11-03 (WIB)  
Status: Draf untuk persetujuan

## Tujuan dan cakupan

Tambahkan tindakan **Hapus daftar** pada kartu Daftar Belanja, termasuk daftar yang sudah disetujui seperti pada gambar. Pengguna memilih pembatalan yang tercatat dan pembalikan stok. Riwayat tetap dapat ditelusuri dan pengulangan tindakan tidak boleh membalikkan stok dua kali. Belanja Terdahulu tidak termasuk cakupan.

## Pendekatan yang dipertimbangkan

1. **Pembatalan tercatat dan pembalikan stok — dipilih.** Pertahankan asal transaksi dan jejak pembalikan; stok yang benar-benar ditambahkan dikurangi sekali. Memerlukan penanganan transaksi, izin, dan kondisi terkait.
2. **Hapus permanen beserta pembalikan stok.** Menghilangkan kartu dan catatan sumber, tetapi membuat perubahan stok dan keuangan sulit ditelusuri. Tidak dipilih.

## Pengalaman pengguna

- Tampilkan **Hapus daftar** di **Tindakan lainnya** untuk daftar yang masih dapat dibatalkan, termasuk yang sudah disetujui. Hanya pengguna dengan izin khusus yang boleh menjalankan aksi; server memeriksa izin dan toko kembali. Izin mengikuti pola RBAC proyek dan secara awal hanya diberikan kepada Owner, dengan Admin dapat diberi izin melalui pengaturan.
- Tindakan membuka dialog yang menyebut nomor/nama daftar, mewajibkan alasan, dan merangkum jumlah barang yang akan dikurangi serta catatan keuangan/HPP yang tetap ada. Konfirmasi eksplisit menjalankan pembatalan; tombol batal menutup dialog tanpa perubahan. Komponen harus dapat digunakan dengan keyboard dan di layar kecil.
- Setelah berhasil, daftar hilang dari tampilan aktif. Riwayat tetap bisa dicari menggunakan filter **Dibatalkan**, menampilkan siapa yang membatalkan, kapan, alasan, dan status serta dokumen terkait sebelum pembatalan. Aksi penerimaan, edit, dan persetujuan untuk daftar dan pembelian yang dibatalkan tidak tersedia lagi.
- Sebelum konfirmasi atau saat terjadi konflik, jelaskan barang yang stoknya tidak cukup atau data lama yang tidak bisa ditelusuri. Tidak ada perubahan sebagian ketika proses gagal.

## Aturan stok dan riwayat

- Tanpa penerimaan atau perubahan stok yang benar-benar diterapkan, tidak ada perubahan stok.
- Untuk penerimaan yang sudah menambah stok, kurangi tepat sejumlah yang dicatat sebagai penambahan aktual, termasuk penerimaan bertahap dan konversi satuan/grup stok yang berlaku saat perubahan asal. Jangan mengurangi jumlah pesanan yang belum diterima, item yang tidak menambah stok, atau baris yang telah dibalik sebelumnya. Pada bundle penerimaan modern, hitung dampak stok dari entri canonical; entri varian hanya proyeksi grup dan tidak boleh dihitung lagi. Jika grup atau satuan dasar berubah sehingga dampak asal tidak dapat dipetakan dengan pasti, hentikan untuk pemeriksaan manual.
- Periksa alur daftar lama yang dapat menerapkan stok langsung; balik hanya perubahan yang dapat dihubungkan secara pasti ke daftar tersebut. Jika catatan lama atau konversi tidak cukup untuk menentukan dampaknya, hentikan dengan pesan yang jelas dan minta pemeriksaan manual.
- Jika stok saat ini lebih kecil daripada jumlah yang harus dikurangi pada produk atau grup mana pun, hentikan seluruh operasi dan tampilkan barang serta jumlah yang kurang. Tidak membuat stok negatif.
- Simpan catatan pembalikan yang menghubungkan daftar, pembelian, penerimaan, dan pergerakan stok asal, termasuk jumlah/satuan, pelaku, waktu, dan alasan. Gunakan pergerakan keluar baru dan mekanisme penilaian persediaan yang berlaku; pertahankan catatan asal. Periksa dan kunci status bundle asal, serta cegah undo batch generik membalikkan dampak yang sama lagi. Jangan memakai pemulihan snapshot lama sebagai pengganti pengurangan delta stok saat ini. Status riwayat penerimaan yang telah disetujui tetap menunjukkan kejadian asal dengan penanda bahwa dampaknya telah dibalik. Penerimaan yang belum selesai dibatalkan dan tidak dapat disetujui lagi.
- Tandai daftar dan pembelian terkait sebagai dibatalkan; simpan riwayat dan nonaktifkan semua jalur yang masih dapat memproses dokumen tersebut. Status pembelian yang dibatalkan membutuhkan dukungan skema, migrasi, label, serta penjagaan semua endpoint terkait. Metadata pembatalan baru tidak menimpa metadata persetujuan sebelumnya. Pastikan daftar, pembelian, penerimaan, stok, catatan pembalikan, dan penilaian berubah dalam satu transaksi database. Kunci data yang relevan dan periksa ulang status serta stok di dalam transaksi agar aksi bersamaan, permintaan ulang, dan persetujuan penerimaan bersamaan tidak menimbulkan pembalikan ganda atau stok negatif.

## Keuangan dan harga

- Usulan untuk ditinjau: **pertahankan pengeluaran dan catatan pembayaran yang sudah ada**. Tombol ini tidak menyatakan bahwa uang sudah dikembalikan atau giro sudah dibatalkan. Pengeluaran tetap terhubung ke riwayat dan tetap masuk laporan. Pengeluaran otomatis tersebut saat ini tidak dapat diedit atau dihapus dari halaman Keuangan. Dialog menjelaskan bahwa pengembalian uang dan perubahan kewajiban tidak dicatat secara otomatis dan memerlukan proses terpisah di luar cakupan fitur ini.
- Usulan untuk ditinjau: **jangan otomatis mengembalikan HPP atau harga jual master** yang mungkin sudah berubah setelah penerimaan. Tampilkan peringatan agar harga diperiksa; gunakan mekanisme perubahan harga yang ada jika diperlukan.
- Penilaian stok harus mencerminkan pengurangan aktual pada waktu pembatalan tanpa menghapus pergerakan atau perubahan harga setelah penerimaan.

## Integrasi dan batasan

- Perbarui Bantuan, katalog workflow AI Assistant, catatan perubahan, dan dokumentasi fitur sesuai pedoman repositori; gunakan tanggal rilis WIB saat implementasi selesai.
- Jangan mengubah Belanja Terdahulu. Jangan menghapus permanen transaksi, riwayat penerimaan, atau pengeluaran terkait.
- Pemeriksaan keberhasilan mencakup daftar tanpa penerimaan, penerimaan sebagian dan bertahap, stok tidak cukup, stok grup/satuan, data lama yang tidak dapat ditelusuri, izin dan isolasi toko, pembatalan ulang, konkurensi, riwayat, dampak keuangan dan harga, serta tampilan keyboard/mobile. Ikuti ketentuan TDD repositori saat implementasi.

