# Desain ulang Perubahan Nota

Tanggal: 2026-11-05 (WIB)\r\nStatus: arah A dipilih dan rancangan disetujui pengguna pada 2026-11-05.

## Tujuan dan cakupan

Desain ulang halaman Perubahan Nota yang sudah ada agar Owner cepat memahami siapa yang mengubah transaksi, kapan, rincian yang berubah, dan selisih nilai transaksi. Pekerjaan ini terbatas pada penyajian serta interaksi halaman, termasuk tampilan nota asli dan versi lengkap.

Gunakan komponen React, data snapshot, API, hak akses Owner, dan identitas visual aplikasi yang sudah tersedia. Aturan pencatatan Sales, notifikasi, serta penyimpanan versi tetap menjadi sumber perilaku fitur.

## Pendekatan yang dipertimbangkan

- **A, Meja audit nota (dipilih):** navigasi revisi di sisi kiri, ringkasan perubahan dan perbandingan per rincian di area utama. Memudahkan pemeriksaan cepat; rincian lengkap tersedia melalui pilihan tampilan.
- **B, Dua lembar nota:** rincian sebelum dan sesudah langsung berdampingan dengan bagian yang berubah ditandai. Akrab seperti membaca nota, tetapi mengulang banyak rincian yang sama dan lebih panjang pada ponsel.

Pengguna memilih A setelah melihat mockup interaktif dengan data contoh.

## Susunan dan interaksi

1. **Konteks nota:** judul, nomor nota, dan tautan kembali ke Riwayat. Identitas nota mudah dibaca dan nomor panjang dapat membungkus.
2. **Jejak perubahan:** nota asli, kemudian setiap revisi secara kronologis. Setiap revisi menampilkan nomor, nama Sales, dan waktu WIB. Revisi aktif serta revisi terbaru dibedakan. Pada ponsel, gunakan pemilih versi berlabel agar navigasi tetap ringkas.
3. **Ringkasan revisi:** uraian perubahan berdasarkan data tersimpan, nama pelaku, tanggal dan waktu, serta total sebelum dan sesudah. Selisih dinyatakan sebagai naik, turun, atau tetap; warna tidak menilai perubahan sebagai benar atau salah.
4. **Yang berubah (tampilan awal):** perbandingan Sebelum dan Sesudah, dikelompokkan menjadi barang, transaksi, pembayaran, dan rincian Percetakan bila tersedia. Pecah blok teks panjang menjadi rincian yang bisa dipindai. Barang ditambahkan atau dihapus diberi penjelasan yang jelas.
5. **Nota asli:** lembar rincian awal sebelum perubahan Sales pertama, disusun dengan informasi pelanggan, Sales, barang, pembayaran, total, dan catatan. Ini merupakan rincian tersimpan, bukan reproduksi cetak atau identitas toko pada masa lalu.
6. **Versi lengkap:** dua lembar rincian sebelum dan sesudah revisi terpilih. Berdampingan bila cukup lebar dan tersusun ke bawah pada ponsel, dengan label versi selalu jelas.

Nama status dan metode pembayaran memakai bahasa Indonesia yang ramah. ID teknis ditempatkan dalam rincian tambahan yang dapat dibuka. Perubahan identitas tetap terlihat pada perbandingan walaupun nama tampilannya sama.

## Arah visual

Gunakan gaya meja pemeriksaan nota: navigasi berwarna tinta gelap, bidang rincian terang, aksen biru aplikasi untuk versi aktif dan nilai sesudah, serta pemisah putus-putus pada lembar nota. Angka rupiah sejajar dan menggunakan digit dengan lebar tetap. Ikuti tipografi aplikasi agar halaman terasa menyatu dengan produk.

Ritme visual membedakan konteks, ringkasan nilai, dan rincian. Animasi hanya untuk umpan balik interaksi; hormati pengaturan pengurangan gerakan. Utamakan ruang baca daripada dekorasi.

## Batasan dan kriteria penerimaan

- Tautan notifikasi tetap membuka revisi yang tepat, termasuk saat sudah ada revisi berikutnya. ID tidak ditemukan tetap memiliki penjelasan dan menampilkan revisi terbaru.
- Semua versi dan rincian yang sebelumnya dapat diperiksa tetap tersedia. Perbandingan tidak kehilangan perubahan ID, pecahan nilai, waktu, item berulang, barang tanpa ID, pembayaran, dan dokumen Percetakan.
- Susunan ulang barang tidak boleh menyebabkan informasi hilang atau pasangan sebelum/sesudah yang menyesatkan. Kasus pencocokan ambigu ditampilkan secara utuh dan jelas.
- Keadaan memuat, kosong, dan gagal memiliki tampilan yang sesuai; kegagalan memuat dapat dicoba kembali.
- Pemilihan revisi dan tampilan dapat dioperasikan dengan keyboard, memiliki fokus yang terlihat, label yang jelas, serta target sentuh yang nyaman. Perubahan tidak dibedakan melalui warna saja.
- Tidak ada gulir horizontal halaman pada lebar ponsel. Nama, catatan, nomor nota, dan jumlah revisi yang panjang tetap dapat dibaca.
- Sebelum implementasi, tulis dan jalankan tes perilaku yang gagal; setelah implementasi, verifikasi regresi, TypeScript, lint, dan interaksi browser yang relevan. Jangan menjalankan production build atau mengubah siklus server aplikasi.
- Perbarui Bantuan, pratinjau panduan, katalog workflow AI, dokumentasi, serta Catatan Perubahan sesuai navigasi akhir yang benar-benar diterapkan.

## Catatan pelaksanaan

- Mockup sementara tersimpan di `.superpowers/brainstorm/1648-1793819043/content/receipt-ui-directions.html`; semua transaksi di dalamnya diberi label data contoh. Mockup tidak mengubah kode produk.
- Mockup sudah diperiksa untuk pemilihan revisi, nota asli, dua versi lengkap, serta lebar ponsel 390 px tanpa luapan horizontal. Konsol browser tidak melaporkan error atau warning pada pemeriksaan tersebut.
- Drive `D:` yang ditentukan untuk dokumentasi tidak tersedia. Dokumen disimpan di `markdown-files` pada worktree aktif sebagai pengganti sementara.
- Headroom stats dan compress telah dipanggil. Proxy kompresi lokal tidak terjangkau; pembacaan dilakukan dengan keluaran yang dibatasi.
