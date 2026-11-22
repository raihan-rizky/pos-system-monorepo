# Rancangan penyelarasan arus kas dan jatuh tempo

Tanggal: 2026-11-16 WIB

## Tujuan dan temuan

Halaman Keuangan harus memperlihatkan cara setiap total dihitung dan memastikan Net Cash Flow sama dengan Pemasukan dikurangi Pengeluaran yang terlihat. Pada `dev` saat ini, Net Cash Flow menggunakan penerimaan kas dan pembayaran aktual, sedangkan kartu pemasukan dan pengeluaran memakai sumber lain. Pengeluaran Pembelian Barang juga disaring berdasarkan tanggal catatan pengeluaran, sehingga perubahan jatuh tempo tidak memindahkan bagian giro ke tanggal yang baru.

Rancangan ini mengikuti pilihan pengguna: pelunasan piutang manual termasuk dalam Pemasukan, dan pembayaran giro dihitung pada tanggal dibayar sedangkan sisa yang belum dibayar dihitung pada tanggal jatuh tempo. Semua tanggal hari dan bulan menggunakan WIB.

## Pendekatan yang dipertimbangkan

1. **Proyeksi bersama berdasarkan pembayaran dan jatuh tempo — dipilih.** Hitung baris dan total untuk halaman Keuangan dari catatan pembayaran, jadwal giro terbaru, dan pengeluaran manual. Koreksi jadwal langsung tercermin pada tampilan tanpa menulis ulang catatan pengeluaran historis. Proyeksi perlu menangani beberapa giro dan riwayat pembayaran yang tidak lengkap.
2. **Kas aktual saja.** Menghitung giro hanya saat dibayar lebih dekat ke arus kas aktual, tetapi giro yang belum dibayar tidak akan muncul pada tanggal jatuh tempo; pengguna memilih pendekatan pertama.
3. **Memindahkan tanggal satu catatan pengeluaran.** Perubahannya lebih kecil, tetapi satu pembelian dapat memiliki transfer dan beberapa giro dengan tanggal berbeda. Satu tanggal tidak dapat merepresentasikan semua bagian dan dapat mengubah bukti historis.

## Aturan angka

- **Pemasukan** = penerimaan penjualan dan pemasukan manual yang sudah dihitung pada halaman + pelunasan piutang manual pada tanggal pembayaran. Satu pembayaran hanya masuk satu kali. Jumlah harian, total bulanan, grafik, dan nilai yang dipakai Net Cash Flow berasal dari komponen yang sama.
- **Pengeluaran** = pengeluaran manual bersih dari kembalian + bagian transfer yang telah dicatat + bagian giro yang sudah diakui menurut aturan berikut. Pembayaran hutang manual yang tidak terkait giro tetap mengikuti perilaku yang berlaku dan tidak otomatis menjadi pengeluaran.
- Untuk giro, pembayaran yang terjadi sebelum atau pada jatuh tempo dihitung pada tanggal pembayarannya. Pada tanggal jatuh tempo, sisa yang belum diakui dihitung sebagai pengeluaran. Pembayaran setelah tanggal tersebut mengurangi hutang tetapi tidak dicatat lagi sebagai pengeluaran. Contoh: giro Rp100.000, dibayar Rp30.000 pada November, jatuh tempo Desember: November Rp30.000 dan Desember Rp70.000. Pembayaran sesudah jatuh tempo tidak menambah Rp70.000 lagi.
- Bila jatuh tempo diperbaiki, gunakan jadwal terbaru untuk menghitung ulang periode yang ditampilkan. Sisa yang dipindah ke tanggal mendatang tidak muncul pada riwayat atau total sampai tanggal itu tiba; pembayaran yang telah terjadi tetap terlihat pada tanggal yang sesuai.
- Untuk beberapa giro, gunakan alokasi pembayaran yang tersimpan jika tersedia. Jika pembayaran historis hanya terhubung ke pembelian, alokasikan secara konsisten ke sisa giro dengan jatuh tempo paling awal, lalu ID stabil sebagai pemecah seri. Jelaskan bahwa alokasi tersebut dihitung sistem. Transfer dan setiap giro dipisah agar jumlah bagian pembelian yang dijadwalkan tidak melebihi total pembelian.
- Jika koreksi membuat nilai pembelian lebih kecil daripada pembayaran yang sudah tercatat, pembayaran tetap diperlihatkan pada tanggalnya. Pisahkan bagian yang melebihi nilai pembelian sebagai **kelebihan pembayaran yang belum dikembalikan**, dan tetap masukkan bagian itu ke total Pengeluaran. Contoh: dibayar Rp100.000, nilai dikoreksi menjadi Rp70.000, dan belum ada pengembalian: Pengeluaran tetap Rp100.000, terdiri dari Rp70.000 pembelian dan Rp30.000 kelebihan pembayaran. Alokasikan pembayaran paling awal ke nilai pembelian terlebih dahulu, dengan ID stabil sebagai pemecah seri. Jangan menganggap ada pengembalian tanpa catatan yang sah; bila alur pengembalian belum tersedia, jelaskan bahwa penyelesaiannya memerlukan pencatatan terpisah.
- Catatan lama yang tidak memiliki jadwal, sumber, atau riwayat pembayaran yang dapat dipastikan tidak boleh diam-diam dianggap lunas atau belum dibayar. Tampilkan bahwa perhitungan terkait belum lengkap dan arahkan pengguna untuk memeriksa riwayat giro; jangan menyajikan angka parsial sebagai total lengkap.
- **Net Cash Flow** = total Pemasukan yang ditampilkan − total Pengeluaran yang ditampilkan. Karena sisa giro masuk pada jadwal jatuh tempo meskipun belum dibayar, beri keterangan yang jelas bahwa angka halaman ini menggunakan jadwal giro; laporan kas aktual dan riwayat hutang tetap dapat digunakan untuk melihat pembayaran sebenarnya.
- Gunakan satuan sen untuk penjumlahan dan pengurangan; format rupiah hanya saat menampilkan angka. Data satu toko tidak boleh bercampur dengan toko lain.

## Tampilan dan keterlacakan

- Berikan rincian perhitungan yang mudah dibuka pada Net Cash Flow, Pemasukan, dan Pengeluaran. Tampilkan komponen dan nominalnya, bukan hanya teks penjelasan: penerimaan penjualan, pemasukan manual, pelunasan piutang manual, pengeluaran manual, transfer, pembayaran giro sebelum jatuh tempo, sisa giro pada jatuh tempo, dan kelebihan pembayaran yang belum dikembalikan bila ada. Komponen dijumlahkan hingga sama dengan total yang terlihat. Jelaskan juga bahwa persentase kategori = total kategori ÷ total Pengeluaran × 100%.
- Riwayat Pengeluaran menampilkan tanggal, nominal, dan sumber tiap komponen yang diakui; bagian giro diberi keterangan pembayaran atau sisa jatuh tempo. Jika sistem mengalokasikan pembayaran ke giro berdasarkan urutan jatuh tempo, tampilkan penjelasan tersebut pada rincian. Total kategori, jumlah entri, grafik, dan daftar menggunakan proyeksi yang sama, termasuk setelah penyaringan dan paginasi.
- Pemasukan harian dan rinciannya menunjukkan porsi pelunasan piutang manual secara terpisah, sehingga jumlah harian yang ditampilkan dapat dijelaskan. Pertahankan akses riwayat dan lindungi rincian yang memerlukan izin tambahan.
- Tampilkan keadaan pemuatan, kosong, gagal, belum lengkap, dan tanpa akses secara jelas. Rincian dapat dibuka dengan keyboard dan tetap terbaca pada layar kecil.

## Batas implementasi

- Gunakan kondisi `origin/dev` terbaru sebagai dasar kerja terisolasi karena worktree utama berisi perubahan pengguna yang luas dan versinya lebih lama. Jangan menghapus atau menimpa perubahan itu.
- Satukan dasar perhitungan di server untuk ringkasan, grafik, dan daftar. Respons harus konsisten setelah perubahan data, termasuk saat cache diperbarui; pertahankan paginasi, pengurutan stabil, filter kategori, dan batas performa.
- Pertahankan pemeriksaan izin dan pembatasan toko pada setiap API. Pemasukan dan pengeluaran tetap dapat ditampilkan masing-masing bagi peran yang hanya memiliki salah satu izin, sementara Net Cash Flow memerlukan keduanya. Detail transaksi dan piutang mengikuti izin yang berlaku.
- Jangan mengubah catatan pembayaran, hutang, atau jadwal historis hanya untuk mengubah tampilan. Hindari migrasi bila proyeksi dapat dibangun dari data yang sudah ada. Laporan kas aktual dan ekspor yang sudah membedakan jadwal dari pembayaran tidak diubah diam-diam.
- Perbarui dokumentasi di `markdown-files`, Bantuan, katalog alur Asisten AI jika prosedur berubah, serta Catatan Perubahan sesuai aturan repositori.

## Verifikasi

- Mulai dengan tes yang gagal untuk selisih Net Cash Flow dan kartu, pelunasan piutang manual, serta perubahan jatuh tempo lintas bulan dan dalam bulan yang sama.
- Uji pembayaran awal, sebagian, pada jatuh tempo dan setelah jatuh tempo; beberapa giro dengan tanggal berbeda; transfer campuran; koreksi yang menghasilkan kelebihan pembayaran; data lama dan riwayat belum diverifikasi; pembulatan sen serta batas tengah malam WIB. Pastikan angka komponen, total, grafik, daftar, kategori, dan halaman berikutnya saling cocok.
- Uji izin baca yang diberikan dan ditolak, pembatasan toko, cache saat koreksi disimpan, keadaan kesalahan, keyboard, dan tampilan seluler. Jalankan pemeriksaan yang relevan tanpa `pnpm build` dan tanpa mengelola server pengembangan.
