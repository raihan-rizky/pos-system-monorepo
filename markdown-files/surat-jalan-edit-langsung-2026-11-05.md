# Surat Jalan: edit langsung di struk

Tanggal: 2026-11-05 (WIB)

## Alur pengguna

1. Buka Riwayat, pilih menu transaksi, lalu **Cetak Surat Jalan**. Struk langsung terbuka; membuka struk tidak menyimpan pengiriman baru.
2. Edit penerima, nama barang, jumlah, dan keterangan langsung pada struk. Nama barang merupakan nama pada dokumen dan tidak mengubah katalog maupun invoice. Jumlah 0 menghapus baris saat disimpan; sedikitnya satu baris harus bernilai positif.
3. Pilih **Simpan & Cetak**. Dokumen dari respons server ditampilkan sebelum dialog cetak dibuka. Untuk dokumen yang tidak berubah, **Cetak** hanya mencetak ulang.

Dokumen aktif terbaru dipilih otomatis. Pilihan **Dokumen** membuka pengiriman lain; **Pengiriman baru** tersedia sesuai izin dan sisa barang. Dokumen tersimpan hanya mengedit baris yang sudah ada. Untuk mengirim barang lain, gunakan pengiriman baru.

Saat menutup atau berpindah dengan perubahan yang belum disimpan, pilih **Lanjut edit** atau **Buang perubahan**. Saat menyimpan, perpindahan dan penutupan ditahan. Kegagalan penyimpanan dan pembaruan data di latar belakang mempertahankan isian. Escape pada kolom mengembalikan nilai saat kolom mulai difokuskan dan tidak menutup struk; pengetikan IME tetap dihormati.

## Izin dan status

- `surat_jalan.create`: membuat pengiriman baru.
- `surat_jalan.update`: mengubah dokumen tersimpan dan melakukan approval.
- Hak akses default tidak diperluas; izin update bawaan tetap hanya Owner.
- `surat_jalan.auto_approve.create`: menentukan konfirmasi otomatis sesuai perilaku sebelumnya.
- Dokumen PENDING menampilkan **Setujui surat jalan** bagi pengguna berizin. Simpan perubahan sebelum approval.
- Dokumen CANCELLED/REJECTED dan transaksi VOIDED/REFUNDED hanya dapat dilihat atau dicetak ulang.

## Validasi dan stok

- Batas jumlah setiap baris berasal dari invoice dikurangi dokumen PENDING dan CONFIRMED lain. Jumlah pada draft baru memakai sisa tersebut, termasuk reservasi dokumen pending.
- `PATCH /api/surat-jalan/[id]/document` memeriksa izin, toko, status transaksi, dan `expectedUpdatedAt` di server. Versi yang tertinggal mendapat 409; isian lokal dipertahankan.
- Penguncian transaksi dilakukan sebelum membaca dokumen yang akan diubah. Penyimpanan baris, perubahan stok, dan jurnal terjadi secara atomik.
- Approval juga membaca ulang dokumen setelah memperoleh kunci transaksi agar jumlah yang disetujui mengikuti perubahan yang selesai saat approval menunggu.
- Transaksi dengan sumber pengurangan stok TRANSACTION tidak mengurangi stok lagi.
- Pada transaksi lama SURAT_JALAN dengan dokumen CONFIRMED, hanya selisih jumlah yang disesuaikan. Jurnal lama, grup stok dan multiplier harus membuktikan jumlah lama; perubahan yang tidak dapat dibuktikan ditolak. Pengembalian dan pengeluaran selisih memiliki jurnal baru.
- Seluruh produk/grup yang terpengaruh dikunci bersama dan keanggotaan/satuan dibaca ulang. Pengembalian diterapkan sebelum pengurangan agar perubahan beberapa SKU dalam grup yang sama dapat memakai saldo bersih yang valid.
- Identitas produk, satuan, nomor, tanggal serta identitas/status approval tetap ditentukan server.

## Tampilan dan cetak

Kolom transparan mengikuti teks struk, dengan petunjuk pensil, fokus yang terlihat, serta nama invoice dan tombol pemulihan nama pada layar. Tampilan menyesuaikan ponsel. Hasil cetak hanya menampilkan teks, tanpa kontrol edit, petunjuk, atau toolbar.

Ukuran kertas tetap 215 × 165 mm. Dokumen panjang dapat berlanjut ke halaman berikutnya; header tabel berulang dan konten tidak dipotong oleh tinggi halaman tetap.

## Komponen dan API

- `SuratJalanCreateModal`: memuat bundle, pengaturan toko, izin, serta operasi simpan/approval dan pembaruan cache.
- `SuratJalanReceiptEditor`: state edit, pemilihan dokumen, guard penyimpanan, peringatan perubahan, dan cetak setelah respons kanonik.
- `SuratJalanDocument`: dokumen bersama untuk layar dan cetak.
- `SuratJalanPrintModal`: tombol dokumen tersimpan membuka editor yang sama dengan ID yang dipilih.
- `surat-jalan-document.ts`: aturan jumlah, snapshot nama, dan pembuktian selisih stok.

Tidak ada perubahan skema atau dependensi aplikasi. Bantuan, workflow AI Assistant, metadata RBAC, dan Catatan Perubahan diperbarui bersama fitur.

## Verifikasi

Catatan perintah dan hasil akhir tersimpan di `.superpowers/sdd/surat-jalan-edit-langsung-plan-2026-11-05/`. Pengujian menggunakan data contoh tanpa data pelanggan. Pemeriksaan browser mencakup payload edit, klik ganda, respons kanonik sebelum cetak, cetak ulang, konflik, close/switch, refresh di latar belakang, read-only, layar 390 px, dan media print.

Dokumen 42 baris diuji melalui PDF lima halaman; baris terakhir tersedia dan ukuran halaman tetap 215 × 165 mm. Hasil pengujian seluruh proyek dan batas lingkungan dicatat pada ledger implementasi.

Verifikasi checkout publikasi dari main: 196 tes terarah pada 18 file lolos, TypeScript seluruh paket web lolos, pengujian browser lolos, ESLint pada 24 file bersih, dan pemeriksaan whitespace lolos. Riwayat pengujian checkout sumber serta batas lingkungan tercatat di [laporan verifikasi](surat-jalan-verifikasi-2026-11-05.md).

Review independen menemukan dan memicu tes regresi untuk approval yang menunggu kunci, perubahan jumlah lintas satuan grup stok, dan pembaruan versi server setelah penyimpanan sendiri. Ketiganya diperbaiki; editor mengikuti versi server yang lebih baru ketika tidak ada edit lokal, sambil mempertahankan snapshot dan versi selama pengguna mengedit.

Lokasi dokumentasi menggunakan `markdown-files` pada checkout aktif karena drive D yang disebut dalam panduan repositori tidak tersedia.

## Integrasi main

Fitur dipublikasikan dari checkout terpisah berbasis origin/main dengan manifest file eksplisit. Perubahan lain beserta staging di checkout sumber dipertahankan. Panduan Q8, Bantuan Surat Jalan, metadata izin, serta satu entri Catatan Perubahan diterapkan pada versi file di main.
