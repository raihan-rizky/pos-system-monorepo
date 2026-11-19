# Rancangan koreksi pembayaran pembelian

Tanggal: 2026-11-19 (WIB)

Status: disetujui untuk implementasi; contoh visual tersedia untuk rujukan antarmuka.

## Tujuan dan keadaan saat ini

Pengguna berizin dapat mengoreksi pembayaran pembelian yang disetujui kapan saja dari Supplier → Daftar Belanja, termasuk saat ada penerimaan yang belum selesai. Peringatan muncul saat ingin mengubah, tetapi keberadaan penerimaan yang menunggu persetujuan tidak menghalangi koreksi pembayaran. Contoh kebutuhan: total Rp8.936.156 dibagi menjadi Transfer Rp4.947.500 dan Giro Rp3.988.656 dengan jatuh tempo 5 Desember 2026.

Production sudah mempunyai **Tindakan lainnya → Edit daftar**, formulir jadwal pembayaran, alasan, pratinjau, riwayat koreksi, serta penyesuaian utang supplier dan alokasi pembayaran. Saat ini perencanaan koreksi menolak seluruh perubahan jika ada penerimaan yang menunggu persetujuan. Selain itu, koreksi pada pembelian yang diterima sebagian dapat menghitung kembali total berdasarkan barang yang sudah diterima; hal tersebut tidak sesuai untuk perubahan yang hanya menyangkut pembayaran.

## Pendekatan

1. **Simpan langsung dengan peringatan**: gunakan dan perluas koreksi yang sudah ada. Pengguna berizin mengubah rincian dari daftar, memeriksa dampaknya, lalu menyimpan langsung dengan riwayat. Ini pilihan pengguna karena fleksibilitas diutamakan.
2. **Ajukan untuk persetujuan**: koreksi dibuat dari daftar tetapi baru berlaku setelah disetujui. Pendekatan ini menambah waktu tunggu dan tidak dipilih.

Gunakan mekanisme koreksi, riwayat, dan izin supplier.shopping_request.correct_processed:update yang sudah tersedia; jangan membuat jalur keuangan atau riwayat terpisah. Izin tersebut secara default terbatas pada Owner dan dapat didelegasikan melalui pengaturan yang ada.

## Arah visual dan interaksi

- **Arah:** utilitarian untuk pekerjaan keuangan, dengan sentuhan editorial yang tenang. Tujuannya membantu pengguna memahami perubahan dan mengambil keputusan dengan cepat. Penanda khasnya adalah ringkasan pembelian yang selalu mudah ditemukan dan pemisahan tegas antara rencana pembayaran dan pembayaran yang sudah tercatat.
- **Penilaian DFII:** dampak visual 4, kesesuaian konteks 4, kemudahan implementasi 4, keamanan performa 4, risiko konsistensi 2; skor 14. Gunakan arah ini hanya pada alur koreksi agar tetap selaras dengan POS.
- **Sistem visual:** warna hijau pinus sebagai identitas dialog, permukaan netral terang, dan amber untuk peringatan; definisikan warna dengan variabel CSS. Gunakan Sora untuk judul dan Source Sans 3 untuk isi, dengan angka tabular. Font harus dimuat secara lokal beserta lisensinya, tanpa permintaan jaringan saat pengguna membuka aplikasi.
- Pada layar lebar, letakkan rincian yang dapat diedit di sebelah kiri dan ringkasan perubahan di sebelah kanan. Pada layar kecil, tampilkan ringkasan singkat lebih dahulu, lalu field dalam satu kolom dan tindakan yang mudah dijangkau. Peringatan berupa pesan jelas yang tetap memungkinkan pengguna melanjutkan.
- Contoh visual menggunakan jalur **Daftar Belanja → Tindakan lainnya → Ubah pembayaran**. Identitas pembelian dan pembayaran tercatat pada contoh adalah ilustrasi, sementara nominal rencana menggunakan contoh yang diminta. Pratinjau dan penyimpanan dalam contoh hanya simulasi.
- Pilihan untuk mengoreksi pembayaran yang sudah tercatat pada awalnya tidak dicentang. Jika rencana transfer berbeda dari catatan pembayaran, tampilkan peringatan agar pengguna dapat memutuskan apakah catatan tersebut perlu dikoreksi; perbedaan ini sendiri tidak otomatis mengubah catatan pembayaran.
- Kelompokkan setiap pembayaran dengan label yang terlihat, tampilkan selisih alokasi secara langsung, dan tempatkan koreksi pembayaran aktual pada bagian tersendiri. Tampilkan kesalahan setelah interaksi atau percobaan menyimpan, hubungkan pesan dengan field, dan umumkan perubahan yang relevan untuk pembaca layar. Fokus awal, Escape, penutupan, dan pengembalian fokus mengikuti pola dialog yang aksesibel.
- Gerak dibatasi pada kemunculan dialog dan keadaan kontrol yang bermakna; hormati pengaturan pengurangan gerak. Hindari dekorasi yang mengganggu nominal atau peringatan.

## Alur pengguna

- Sediakan cara yang mudah ditemukan untuk membuka koreksi pembayaran dari kartu pembelian yang disetujui, termasuk pembelian yang belum, sebagian, atau seluruhnya diterima. Formulir menampilkan peringatan bahwa penyimpanan mengubah catatan pembayaran dan dapat memengaruhi utang serta laporan.
- Pengguna dapat mengubah atau menambah baris Transfer dan Giro, nominal, catatan, dan tanggal jatuh tempo Giro. Total jadwal harus sesuai total pembelian yang berlaku. Pertahankan dukungan data lama dengan total nol dan baris nol yang telah ada; validasi tanggal dan nominal diterapkan di server dan antarmuka.
- Bedakan **jadwal/rencana pembayaran** dari **pembayaran yang sudah terjadi**. Tampilkan jumlah yang telah tercatat dan izinkan pengguna secara eksplisit mengoreksi nominal, tanggal, dan alokasinya menggunakan kemampuan yang sudah ada. Penyimpanan koreksi jadwal tidak otomatis mengasumsikan uang sudah dibayar, diterima kembali, atau dipindahkan. Jika angka tercatat dan jadwal berbeda, jelaskan dampaknya sebagai peringatan agar pengguna dapat menentukan koreksi yang benar.
- Pertahankan alasan dan pratinjau dampak yang sudah ada. Setelah **Simpan perubahan**, tampilkan jadwal, saldo efektif, dan riwayat yang baru. Teks menggunakan bahasa Indonesia yang ramah dan dapat dipakai dengan keyboard maupun layar kecil.

## Aturan penyimpanan dan konsistensi

- Bedakan secara eksplisit koreksi yang hanya mengubah pembayaran dari koreksi barang atau penerimaan. Untuk perubahan pembayaran saja, pertahankan total pembelian, dasar total, nilai pengeluaran, stok, dan harga produk yang sudah tersimpan, termasuk ketika penerimaan baru sebagian. Jumlah Rp8.936.156 pada contoh tidak boleh dihitung ulang menjadi nilai barang yang sudah diterima saja.
- Pembeda jenis koreksi juga digunakan saat penerimaan berikutnya disetujui: riwayat koreksi pembayaran saja tidak boleh memicu perubahan dasar total dari pesanan menjadi penerimaan atau penyesuaian otomatis nilai pembelian dan jadwal. Pertahankan perilaku pembaruan total untuk koreksi barang yang memang memerlukannya, termasuk riwayat koreksi lama.
- Gunakan transaksi, penguncian sesuai urutan yang sudah dipakai, snapshot sebelum/sesudah, dan pencatatan alokasi pembayaran yang ada. Perbarui jadwal, ringkasan, utang supplier dan saldo efektif secara konsisten tanpa menggandakan pembayaran atau pengeluaran. Pertahankan pembayaran Giro yang telah tercatat dan tanggal pembayaran asli kecuali pengguna secara eksplisit mengoreksinya. Pastikan laporan periode terkait menggunakan nilai dan tanggal efektif yang benar.
- Perubahan pembayaran saja boleh dilanjutkan meskipun ada penerimaan berstatus menunggu atau perlu revisi; tampilkan peringatan yang menjelaskan dampaknya. Tetap lindungi koreksi barang/jumlah yang berpotensi berbenturan dengan penerimaan terkait.
- Penerimaan yang sudah disetujui mempertahankan snapshot historisnya. Jika penerimaan yang masih menunggu membawa jadwal lama, tampilkan peringatan dan gunakan jadwal pembelian terkini pada semua perhitungan saat persetujuan, termasuk transfer awal dan utang Giro. Snapshot lama tidak boleh menimpa koreksi yang lebih baru. Jadwal pertama masih dapat ditetapkan melalui penerimaan jika belum ada jadwal pembelian.
- Pertahankan perilaku penerimaan pertama yang sudah ada: saat penerimaan pertama disetujui, bagian Transfer pada jadwal yang berlaku dicatat sebagai transfer awal. Jelaskan konsekuensi ini pada peringatan sebelum persetujuan; perubahan jadwal sebelum persetujuan sendiri belum mencatat pembayaran aktual.
- Jika data berubah saat formulir terbuka, tampilkan keadaan terkini dan beri kesempatan meninjau kembali serta menyimpan pilihan pengguna. Jangan menghapus atau menimpa pembayaran aktual yang berubah bersamaan secara diam-diam. Catatan koreksi harus mencerminkan keadaan sebenarnya sebelum dan sesudah penyimpanan.
- Validasi identitas toko, sumber pembayaran, jumlah alokasi, riwayat Giro, serta izin server tetap berlaku. Peringatan untuk penerimaan tertunda tidak mengizinkan data keuangan yang tidak dapat direkonsiliasi disimpan secara keliru.

## Verifikasi dan penyelesaian

- Terapkan TDD: tulis dan jalankan kasus gagal sebelum implementasi, lalu uji hasilnya. Cakup perubahan Transfer menjadi Transfer + Giro pada pembelian diterima sebagian dengan total tetap Rp8.936.156; koreksi pembayaran aktual Rp4.947.500 secara eksplisit; utang Giro Rp3.988.656 dan jatuh temponya; pembayaran yang sudah terjadi; riwayat dan laporan; validasi dan kasus data lama bernilai nol; izin default, yang diberi, dan yang ditolak.
- Uji penerimaan yang menunggu persetujuan, termasuk persetujuan setelah koreksi serta perubahan bersamaan. Pastikan perubahan pembayaran bisa disimpan dengan peringatan, jadwal lama tidak menang, dan perlindungan koreksi stok tetap bekerja. Verifikasi total, dasar total, jadwal, pengeluaran, pembayaran aktual, dan saldo Giro kembali sesudah penerimaan berikutnya disetujui, termasuk pembayaran yang dikoreksi sebelum penerimaan pertama.
- Perbarui Bantuan, katalog alur AI Assistant yang terdampak, catatan perubahan, dan dokumentasi fitur. Jalankan pemeriksaan yang relevan tanpa pnpm build dan tanpa mengelola server pengembangan.
- Kebutuhan migrasi ditentukan setelah pemeriksaan implementasi; jika diperlukan saat rilis, jalankan pada lingkungan yang dituju melalui pos-vps. Fitur tersedia di production setelah kode dan migrasi yang diperlukan dirilis. Rilis fitur tidak otomatis mengubah pembelian contoh.
