# Rancangan Surat Jalan: edit langsung di struk

Tanggal: 2026-11-05 (WIB)

Status: disetujui pengguna pada 2026-11-05 WIB; implementasi mengikuti rancangan edit langsung.

## Tujuan dan keputusan pengguna

- Klik **Cetak Surat Jalan** langsung membuka dokumen yang dapat diedit, tanpa ringkasan invoice, kartu statistik, atau tombol Buat Surat Jalan sebagai langkah pembuka.
- Kolom edit menyatu dengan isi surat jalan, mengikuti interaksi pada struk Nota Penawaran.
- Pengguna mengizinkan pengeditan jumlah barang yang dikirim, selain teks dokumen.
- Pengguna memilih **edit langsung di struk** dan bersedia melihat contoh di browser.

## Pendekatan yang dipertimbangkan

1. **Edit langsung pada dokumen, dipilih pengguna.** Input memakai tipografi dan posisi yang sama dengan hasil cetak. Penanda edit muncul saat diarahkan atau difokuskan; tidak ada formulir terpisah. Pendekatan ini paling sesuai dengan permintaan agar edit menyatu dengan struk.
2. **Tombol Ubah untuk masuk mode edit.** Batas antara lihat dan ubah lebih eksplisit, tetapi menambah langkah. Pengguna memilih pendekatan pertama.

## Alur yang diusulkan

1. Aksi dari Riwayat atau tombol Surat Jalan membuka satu pratinjau dokumen. Memuat data menampilkan kerangka dokumen; kegagalan menyediakan pesan dan Coba lagi.
2. Jika belum ada surat jalan aktif, tampilkan draf baru berisi penerima invoice dan seluruh jumlah barang yang masih tersedia untuk dikirim. Membuka atau menutup draf tidak membuat dokumen dan tidak mengubah stok.
3. Jika sudah ada surat jalan aktif, tampilkan dokumen aktif terbaru untuk cetak ulang. Pemilih dokumen yang ringkas menyediakan dokumen sebelumnya; **Pengiriman baru** tersedia jika masih ada sisa dan pengguna memiliki izin membuat. Dokumen lama yang dibatalkan atau ditolak dapat dilihat dengan status yang jelas dan tidak dapat diedit.
4. Pengguna menyunting langsung **Penerima**, **Nama barang pada surat jalan**, **Jumlah**, dan **Keterangan**. Jumlah awal mengikuti dokumen yang dipilih. Untuk draf baru, jumlah nol berarti barang tersebut tidak dikirim. Minimal satu barang harus dikirim.
5. Tombol utama **Simpan & Cetak** menyimpan data yang valid, memperbarui nomor dan isi dari respons server, kemudian membuka dialog cetak browser. Dokumen tersimpan yang tidak diubah memiliki aksi **Cetak** dan tidak membuat pengiriman baru.
6. Jika penyimpanan gagal, dokumen tetap terbuka dengan isian pengguna dan pesan yang jelas. Cetak tidak dilanjutkan. Klik berulang tidak membuat dokumen ganda. Menutup saat penyimpanan berlangsung dinonaktifkan; perubahan yang belum disimpan meminta pilihan Lanjut edit atau Buang perubahan.

## Tampilan dokumen

- Identitas toko, nomor, tanggal, tabel barang, dan tempat tanda tangan tetap mengikuti surat jalan yang ada. Tidak menampilkan harga atau total invoice.
- Nomor, tanggal, identitas toko, dan satuan mengikuti data sistem dan tidak menjadi kolom edit pada perubahan ini.
- Nama barang berupa input atau textarea yang mengikuti tinggi isi. Nama asli dari invoice tersedia sebagai referensi kecil di layar dan dapat dipulihkan; penggantian nama hanya berlaku pada snapshot surat jalan tersebut.
- Penerima, jumlah, dan keterangan menggunakan input transparan dengan ukuran huruf, warna, dan perataan yang sama dengan dokumen. Ikon pensil kecil dan garis fokus membantu menemukan bagian yang dapat diedit.
- Informasi sisa per barang dan status dokumen ditampilkan secukupnya di dekat konteks terkait. Toolbar ringkas menampung pemilih dokumen, Pengiriman baru, dan aksi simpan/cetak.
- Saat cetak, input digantikan teks biasa. Ikon, referensi, toolbar, pesan validasi, dan kontrol edit tidak ikut tercetak.
- Tampilan ponsel menyesuaikan lebar dan tata letak tanpa memotong input atau memaksa halaman melebar. Ukuran kertas cetak tetap 215 mm x 165 mm; banyak baris atau teks panjang harus tetap tercetak tanpa terpotong, dengan halaman lanjutan bila diperlukan.
- Semua kolom mempunyai nama aksesibel dan fokus yang terlihat. Tab berpindah kolom; Escape membatalkan edit kolom yang aktif sebelum menutup dokumen. Enter tidak mengirim formulir tanpa sengaja atau mengganggu komposisi teks IME.

### Alasan visual

- Dokumen menjadi fokus utama karena pengguna datang untuk menyunting dan mencetak surat jalan.
- Warna, huruf, logo, garis tabel, dan tanda tangan mengikuti dokumen yang sudah ada agar hasilnya terasa bagian dari aplikasi.
- Aksen aplikasi dipakai pada fokus edit dan tombol utama agar bidang edit mudah dikenali tanpa memenuhi isi struk dengan dekorasi.
- Tidak ada kartu ringkasan tambahan karena isinya sudah tersedia pada dokumen atau konteks barang.
- Arah visual: dokumen operasional untuk staf toko, mengikuti struk Surat Jalan dan Nota Penawaran saat ini; ENERGY 1 / RHYTHM 1 / MOTION 1.

## Penyimpanan, jumlah, dan stok

Keputusan teknis berikut adalah usulan pelaksana yang perlu disetujui bersama rancangan ini:

- Gunakan komponen dokumen bersama untuk draf, dokumen tersimpan, dan pintu cetak ulang yang sudah ada, agar tampilan serta hasil cetak konsisten.
- Simpan penerima dan keterangan di kolom surat jalan yang sudah tersedia. Nama tampilan disimpan sebagai snapshot `SuratJalanItem.productName`; `productId` dan `transactionItemId` tetap menunjuk barang sebenarnya. Nama produk katalog dan nama pada invoice tidak berubah. Tidak perlu kolom baru untuk nama cetak.
- Pembuatan tetap memakai batas server dan mekanisme approval yang ada. Tambahkan dukungan nama cetak per baris pada kontrak pembuatan.
- Penyuntingan dokumen tersimpan memakai endpoint khusus dengan otorisasi, pembatasan toko, validasi, dan transaksi database. Dokumen aktif PENDING dan CONFIRMED dapat disunting sesuai izin. CANCELLED dan REJECTED hanya dapat dilihat.
- Perubahan jumlah tersimpan memperbarui catatan pengiriman yang sebenarnya. Server mengunci transaksi induk, membaca ulang status serta pengiriman lainnya, lalu membatasi jumlah terhadap invoice setelah dikurangi dokumen PENDING/CONFIRMED lain. Minimal satu baris memiliki jumlah positif; jumlah tidak boleh negatif, NaN, atau tak hingga. Barang harus berasal dari invoice yang sama.
- Pada transaksi dengan sumber stok TRANSACTION, pembuatan, edit, approval, dan cetak ulang surat jalan tidak mengurangi stok lagi.
- Pada transaksi lama dengan sumber stok SURAT_JALAN, perubahan kuantitas dokumen CONFIRMED harus merekonsiliasi selisih stok dan menulis bukti mutasi sesuai helper stok serta unit grup yang ada. Dokumen PENDING tetap mengikuti ketentuan reservasi dan approval yang ada. Perubahan teks saja tidak mengubah stok.
- Jika bukti stok lama tidak cukup untuk merekonsiliasi perubahan jumlah dengan aman, server menolak perubahan jumlah dengan pesan Indonesia yang spesifik; data dan stok tetap utuh. Cetak ulang data yang sudah tersimpan tetap tersedia.
- Penyimpanan tidak mengubah status approval, pemohon, atau nomor dokumen. Respons server menjadi sumber isi yang dicetak. Cache Riwayat, surat jalan, dan inventaris terkait disegarkan setelah penyimpanan.
- Pencetakan ulang tidak membuat record, tidak mengulang approval, dan tidak mengubah jumlah terkirim.
- Pada dokumen tersimpan, editor hanya menampilkan barang yang sudah ada di dokumen itu. Barang invoice lain dikirim melalui **Pengiriman baru**. Jumlah nol mengeluarkan baris dari hasil simpan dan cetak, serta merekonsiliasi kuantitas lama bila diperlukan; setidaknya satu baris harus tetap memiliki jumlah positif. Ini adalah keputusan pelaksana untuk membatasi penyuntingan pada isi dokumen terpilih.
- Pembaruan membawa versi `updatedAt` dokumen yang dibuka. Server memeriksa versi tersebut setelah mengunci transaksi; bila sudah berubah, balas konflik dan pertahankan isian editor agar pengguna dapat memuat ulang serta membandingkan. Jangan menimpa perubahan orang lain secara diam-diam. Ini adalah keputusan pelaksana untuk melindungi penyuntingan bersamaan.

## Hak akses

- Gunakan resource RBAC stabil yang sudah ada: `surat_jalan` dengan aksi read, create, dan update. Create mengatur draf baru; update mengatur perubahan dokumen yang sudah tersimpan. Auto approval tetap mengikuti `surat_jalan.auto_approve`.
- Perbarui deskripsi katalog dan metadata agar cakupan update menjelaskan penyuntingan dokumen serta approval. Tidak menambah izin baru bila resource yang ada cukup.
- Server selalu memeriksa izin dan toko; UI menampilkan kolom baca saja atau menyembunyikan aksi jika izin tidak tersedia.
- Tes mencakup peran yang diizinkan, peran yang ditolak, perilaku default, dan pembatasan toko. Default dan seed hanya diubah jika kontrak izin memang berubah; tambahkan migrasi bila data persisten memerlukannya.

## Batas pekerjaan

- Perubahan ini berfokus pada alur Surat Jalan dan empat jenis isian di atas.
- Desain dan kemampuan Nota Penawaran tetap menjadi rujukan; perubahan dilakukan pada alur Surat Jalan.
- Bantuan, workflow AI Assistant, dan Catatan Perubahan diperbarui sesuai alur yang benar-benar diterapkan. Catatan perubahan memakai tanggal rilis aktual WIB dan visual fitur yang aman.
- Pengelolaan dev server tetap mengikuti instruksi repo. Tidak menjalankan production build.

## Verifikasi yang harus membuktikan hasil

- Tulis tes perilaku dan buktikan gagal sebelum implementasi.
- Klik Cetak Surat Jalan langsung menampilkan dokumen; tidak ada langkah ringkasan atau Buat Surat Jalan.
- Edit penerima, nama, jumlah, dan keterangan langsung pada dokumen; perubahan tersimpan dan tampil sama saat dibuka ulang atau dicetak.
- Uji pengiriman sebagian, dokumen sebelumnya, pembuatan pengiriman berikutnya, dan cetak ulang tanpa duplikasi.
- Uji kegagalan simpan, klik berulang, perubahan status transaksi saat editor terbuka, input invalid, batas sisa pengiriman, serta isolasi toko dan izin server.
- Uji stok TRANSACTION tidak berubah, serta rekonsiliasi stok lama yang didukung bukti dan penolakan yang aman saat bukti tidak cukup.
- Periksa keyboard, ponsel, teks panjang, banyak baris, dan hasil cetak tanpa kontrol edit atau potongan isi.
- Jalankan tes terarah, pemeriksaan TypeScript/lint yang sesuai, dan pemeriksaan dampak GitNexus untuk simbol yang diubah.

## Catatan lingkungan

- Repo aktif: `C:\Projects\pos-system-monorepo`.
- Drive D yang disebut dalam pedoman tidak tersedia; dokumen rancangan disimpan di `markdown-files` repo aktif.
- Headroom MCP telah dipanggil; layanan MCP bekerja dengan penyimpanan lokal, tetapi proxy kompresi yang dikonfigurasi tidak terjangkau.
- Indeks GitNexus awal terdeteksi kedaluwarsa dan pencarian FTS tidak tersedia. Analisis dampak sebelum perubahan kode perlu menggunakan indeks yang dapat dipercaya serta pemeriksaan referensi sumber.
- Workspace berisi perubahan pengguna/agen lain. Implementasi harus mempertahankan perubahan tersebut dan hanya menyunting bagian yang diperlukan.

## Pemeriksaan rancangan

- Satu peninjau independen membaca rancangan dan menanyakan cakupan penambahan/penghapusan baris pada dokumen tersimpan serta perilaku penyimpanan bersamaan.
- Keduanya ditetapkan oleh pelaksana pada bagian penyimpanan di atas dan termasuk dalam rancangan yang diajukan untuk persetujuan.
- Contoh interaksi tersedia melalui visual companion di `.superpowers/brainstorm/1718-1793843903/content/surat-jalan-inline.html`; hanya memakai data contoh dan tidak menyimpan data aplikasi.
