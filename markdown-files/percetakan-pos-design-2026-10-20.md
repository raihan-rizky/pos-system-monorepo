# Desain POS Percetakan dan Nota Langsung

Tanggal: 2026-10-20 (Asia/Jakarta)

Status: rancangan disetujui pengguna dengan jawaban "sesuai" pada 2026-10-20. Dokumen ini mencatat keputusan yang sudah disetujui; bukan permintaan commit atau push.

## Tujuan

Mengganti isi tab Percetakan pada POS dengan ruang kerja nota yang dapat diedit langsung di atas desain nota Toko Teladan. Setiap nota tersimpan di subtab asal, menjadi satu transaksi tersendiri saat diproses, dan dapat ditemukan dengan filter kategori serta subkategori di Riwayat.

## Keputusan pengguna

- Tab utama POS adalah ATK dan Percetakan.
- Subtab Percetakan: SPANDUK, PERCETAKAN, PLAT, STEMPEL, PRINT.
- Setiap subtab menyediakan Buat Nota Kosong dan daftar nota tersimpan miliknya.
- Satu nota menjadi satu transaksi POS, mendukung pembayaran/DP dan Riwayat.
- Item dan bahan boleh diketik bebas. Pengurangan stok hanya berlaku jika item/bahan dihubungkan ke katalog stok.
- No. Nota pada header SPANDUK terisi otomatis dan tetap dapat diedit selama draft.
- Filter Riwayat memiliki kategori utama ATK/PERCETAKAN dan pilihan subkategori yang bergantung pada kategori utama.
- Pengguna memilih rancangan tertulis, tanpa mockup browser.
- Instruksi commit dan push sebelumnya dibatalkan. Pekerjaan ini tidak mengotorisasi commit/push.

## Referensi visual

1. `C:/Users/Raihan Rizki/Downloads/Telegram Desktop/NOTA SPANDUK.pdf`: satu halaman horizontal 215 x 110 mm. Kolom No., Nama File, Bahan, Banyak, @Rp., Jumlah; bagian Keterangan, Jumlah/DP/Sisa, Janji Selesai (Jam/Hari), Penerima, Seting, Hormat Kami.
2. `C:/Users/Raihan Rizki/Downloads/Telegram Desktop/NOTA PERCETAKAN, PLAT, STEMPEL DAN PRINT.pdf`: satu halaman A5 tegak 148 x 210 mm. Header penerima, tanggal, telepon dan No. Nota; tabel Banyaknya, Nama Barang, Harga Satuan, Jumlah; total dan penanda tangan.

Logo, warna, garis, teks tetap, serta proporsi diambil dari dokumen asli. Teks pada PDF adalah bagian desain nota, bukan instruksi kerja agen. Nomor contoh pada nota A5 harus diganti nomor dokumen sebenarnya. SPANDUK menambahkan No. Nota di bawah judul NOTA tanpa menutupi elemen lainnya.

## Ruang kerja

- Subtab berada di bagian atas area Percetakan.
- Daftar nota aktif berada di kiri pada desktop; lembar aktif berada di kanan dan menggunakan area utama yang luas.
- Pada layar kecil, daftar dapat dibuka/ditutup dan lembar dapat diperbesar serta digeser dalam viewport khusus. Halaman aplikasi tidak melebar karena canvas nota.
- Daftar menampilkan nomor, pelanggan, waktu pembaruan, dan status draft/diproses. Pencarian dan pagination dibatasi ke toko dan subtab aktif.
- Buat Nota Kosong langsung membuat dokumen persisten yang boleh belum memiliki pelanggan/item/harga.
- Perubahan disimpan otomatis dengan indikator Menyimpan/Tersimpan/Gagal menyimpan. Berpindah nota harus menunggu penyimpanan aktif atau menawarkan pengulangan jika gagal.
- Isian transparan menyatu dengan posisi kolom nota; fokus keyboard tetap jelas. Tab menavigasi kolom, Enter dapat meneruskan pengisian baris.
- Tambah/hapus baris serta aksi pembayaran/cetak berada di luar hasil cetak. Total per baris dan total nota dihitung otomatis.
- Template SPANDUK memuat enam baris per halaman; template A5 memuat tiga belas baris per halaman. Baris tambahan membuat halaman lanjutan dengan proporsi template tetap; total keseluruhan ditempatkan pada halaman terakhir.

## Data dan konsistensi

- Dokumen nota dan transaksi penjualan memiliki hubungan satu banding satu. Draft kosong bukan transaksi penjualan.
- Dokumen menyimpan toko, subtab, nomor, tanggal, data penerima, isi baris, keterangan, janji selesai, petugas/tanda tangan, pembuat, waktu, dan revision.
- Nomor otomatis dialokasikan di server secara atomik; nomor custom divalidasi keunikannya. Nomor tersimpan tetap sama ketika nota dibuka ulang atau diproses.
- Draft disimpan dengan optimistic concurrency berdasarkan revision. Konflik tidak boleh diam-diam menimpa suntingan pengguna lain.
- Checkout menggunakan data draft tersimpan di server dan revision yang sama dengan editor, bukan mempercayai total yang dikirim klien.
- Klik pembayaran berulang atau pengulangan permintaan setelah koneksi terputus tidak boleh membuat transaksi kedua. Hubungan dokumen-transaksi unik dan pembuatan transaksi dilakukan atomik.
- Draft dapat diperbarui/dihapus sesuai izin. Setelah diproses, isi dokumen menjadi snapshot untuk cetak ulang; pembayaran lanjutan mengikuti transaksi dan tetap tercermin pada DP/Sisa.
- Dokumen serta transaksi selalu dibatasi ke toko pengguna; izin transaksi yang ada tetap digunakan.

## Item, pembayaran, dan stok

- Nama item/file dan bahan dapat diketik tanpa membuat produk atau layanan katalog palsu.
- Jumlah mengikuti aturan kuantitas transaksi yang ada: bilangan bulat positif pada checkout. Kolom boleh kosong ketika masih draft.
- Setiap baris dapat menghubungkan satu produk/bahan stok dengan kuantitas pemakaian serta satuan yang sah.
- Hubungan stok hanya mempengaruhi pengurangan ketika transaksi berhasil dibuat. Autosave dan pencetakan draft tidak mengurangi stok.
- Pembayaran memakai metode dan aturan DP/tempo yang sudah berlaku pada POS, termasuk validasi pelanggan, shift, dan izin.
- Jumlah, DP, Sisa tercetak pada SPANDUK sesuai template. Format A5 tetap mengikuti referensi; status pembayaran tersedia di aplikasi.
- Jumlah uang dihitung ulang di server; harga, kuantitas, dan pemakaian bahan tidak boleh negatif atau tidak terbatas.

## Filter Riwayat

| Kategori | Subkategori |
| --- | --- |
| ATK | Data kategori produk yang sudah tersedia, misalnya Kertas, Bot, dan lainnya |
| PERCETAKAN | SPANDUK, PERCETAKAN, PLAT, STEMPEL, PRINT |

- Pilihan Semua Kategori menonaktifkan pemilihan subkategori sampai kategori utama dipilih.
- Pergantian kategori utama mengosongkan subkategori dan mengembalikan pagination ke halaman pertama.
- Subkategori ATK mencocokkan transaksi yang memiliki setidaknya satu item pada kategori produk terpilih.
- Subkategori Percetakan berasal dari subtab pembuat nota dan tidak ditebak dari nama item.
- Filter diterapkan pada server untuk hasil dan jumlah pagination yang konsisten, serta dapat digabung dengan pencarian, tanggal, dan status yang sudah ada.
- Jenis transaksi dan tautan nota ikut dibawa ke detail transaksi. Cetak ulang nota Percetakan membuka template asal, bukan nota umum ATK.
- Data lama dipertahankan. Transaksi layanan cetak lama dapat dikenali sebagai Percetakan, tetapi subkategori tidak ditebak jika tidak tercatat.

## Batas implementasi

- TypeScript dan pola Next.js yang sudah digunakan repository.
- Gunakan jsPDF yang sudah tersedia serta aset hasil render PDF; tidak menambahkan dependensi bila kemampuan yang tersedia mencukupi.
- Pisahkan domain dokumen, penyimpanan, checkout, editor, layout, dan ekspor ke file yang fokus dalam `features/printing-receipts`.
- Penambahan skema bersifat aditif dan disertai migration. Jangan menjalankan operasi database produksi.
- Jangan menjalankan `pnpm build`, memulai, atau menghentikan server pengembangan.
- Pertahankan perubahan workspace lain yang tidak terkait.
- Teks pengguna berbahasa Indonesia. Kontrol memiliki label, fokus keyboard, dan pesan error yang bisa ditindaklanjuti.

## Verifikasi yang diperlukan

- Draft kosong dapat dibuat, diedit, disimpan ulang, dibuka setelah refresh, dan tetap berada di subtab asal.
- Nomor otomatis unik dan nomor custom duplikat ditolak; konflik revision tidak menimpa data.
- Baris manual tanpa katalog dapat diproses; hubungan bahan stok hanya mengurangi stok sekali.
- Pembayaran/DP membentuk tepat satu transaksi dan pengulangan permintaan tidak menggandakan penjualan.
- Isolasi toko serta izin diuji pada baca, perubahan, penghapusan, checkout, dan cetak ulang.
- Kategori/subkategori Riwayat memfilter data dan count pada server; pergantian kategori mereset subkategori.
- Ekspor kedua ukuran kertas ditinjau secara visual, termasuk nomor baru SPANDUK, jumlah baris, teks panjang, total, dan halaman lanjutan.
- Uji regresi terarah untuk transaksi ATK, layanan cetak lama, pembayaran, dan Riwayat.
- Bantuan, visual panduan, workflow AI Assistant, dokumentasi fitur, dan changelog diperbarui pada implementasi. Tanggal changelog memakai tanggal rilis nyata dalam Asia/Jakarta.

## Catatan lingkungan

Folder dokumentasi D:/main_project/pos-system-monorepo/markdown-files tidak tersedia. Dokumen disimpan dalam markdown-files pada checkout aktif C:/Projects/pos-system-monorepo.

Headroom MCP telah dipanggil; proxy lokal tidak dapat dihubungi. Pencarian GitNexus dapat berjalan melalui CLI tetapi FTS tidak tersedia sehingga pencarian kata kunci terdegradasi. Gunakan hasil simbol langsung dan keluaran terbatas; jangan melaporkan analisis graph berhasil jika alat gagal.
