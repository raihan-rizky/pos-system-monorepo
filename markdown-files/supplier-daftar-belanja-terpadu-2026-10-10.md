# Daftar Belanja dan Pembelian Barang dalam Satu Persetujuan

**Tanggal:** 2026-10-10
**Status:** Rancangan disetujui untuk ditinjau sebagai spesifikasi tertulis

## Tujuan

Di halaman Supplier, pengguna sekarang menyetujui jumlah pada Daftar Belanja, kemudian membuat dan menyetujui Pembelian Barang untuk menetapkan harga aktual. Alur baru memakai satu persetujuan final di Daftar Belanja. Persetujuan itu menetapkan jumlah dan harga, lalu menghasilkan catatan pembelian dan satu Pengeluaran. Penerimaan barang fisik tetap menjadi langkah sesudahnya.

## Tampilan dan alur baru

- Halaman Supplier menampilkan tab **Supplier**, **Rekap Stock In**, **Daftar Belanja**, dan **Penerimaan Barang**. Tab **Pembelian Barang** dihapus. URL lama `?tab=goods-purchases` membuka tab Daftar Belanja agar tautan dan notifikasi lama tetap berguna.
- Tab Daftar Belanja memakai satu riwayat per permohonan. Kartu memperlihatkan status permohonan, ringkasan jumlah, pembelian terkait, total harga final, serta tindakan detail pembelian dan penerimaan bila tersedia. Pencarian dan filter tetap bisa menemukan dokumen lama.
- Pengguna membuat Daftar Belanja dengan supplier, produk, jumlah kebutuhan, dan catatan. Harga final belum wajib pada tahap ini.
- Approver membuka **Setujui Daftar Belanja**. Dalam satu modal, setiap produk menampilkan jumlah kebutuhan, jumlah yang disetujui, harga beli aktual (diisi awal dari HPP master), total baris, dan pilihan memperbarui HPP master bila harga berbeda. Jumlah nol berarti produk ditolak. Approver dapat menambahkan produk master dan memilih varian unit besar sesuai kemampuan review Pembelian Barang yang ada. Modal menampilkan total Pengeluaran dan peringatan bila jumlah melebihi kebutuhan atau HPP awal tidak tersedia.
- Satu tombol **Setujui dan Catat Pembelian** memfinalkan semua produk sekaligus. Tidak ada tombol persetujuan per produk untuk permohonan baru. Approver juga dapat menolak seluruh permohonan dengan alasan; penolakan tidak membuat pembelian atau Pengeluaran. Pembuat permohonan tetap dapat membatalkan permohonan yang belum diputuskan.
- Setelah disetujui, kartu menampilkan nomor Pembelian Barang yang dihasilkan. Pengguna yang memiliki izin penerimaan dapat mencatat barang datang atau membuka riwayat dan perbandingan penerimaan dari kartu yang sama.

## Hak akses

- Persetujuan final memerlukan `supplier.goods_purchase.approve:update`, sesuai pilihan pengguna. Pemegang izin persetujuan Daftar Belanja lama saja tidak dapat memfinalkan harga dan Pengeluaran.
- Penolakan final memerlukan `supplier.goods_purchase.reject:update`. Izin membuat Daftar Belanja dan izin penerimaan barang tetap mengikuti aturan yang berlaku.
- Tombol disembunyikan sesuai izin, dan endpoint memeriksa izin di server. Pengaturan RBAC dan teks Bantuan menjelaskan izin yang kini dipakai.

## Penyimpanan dan integrasi

- `ShoppingRequest` tetap mencatat permohonan dan keputusan jumlah. `GoodsPurchase` tetap menjadi catatan pembelian yang dipakai Penerimaan Barang, HPP, Pengeluaran, dan laporan. Permohonan baru diberi versi alur agar endpoint persetujuan lama tidak dapat melewati aturan satu persetujuan; data lama mempertahankan versi lama.
- Endpoint finalisasi baru memvalidasi toko, supplier, status, item, jumlah, harga, produk tambahan, dan izin. Dalam **satu transaksi database**, endpoint menyimpan keputusan semua item Daftar Belanja, membuat `GoodsPurchase` beserta item berstatus disetujui, menerapkan pembaruan HPP yang dipilih, dan membuat tepat satu `Expense` kategori Bahan. Jika salah satu langkah gagal, tidak ada perubahan parsial.
- Finalisasi kedua atas permohonan yang sama ditolak sebagai konflik. Batasan unik pembelian aktif dan relasi Pengeluaran tetap melindungi pengiriman ulang atau permintaan bersamaan. Respons konflik meminta pengguna memuat ulang detail terbaru.
- Penolakan baru memakai status `REJECTED` dan menyimpan alasan serta pelaku pada Daftar Belanja. Status `CANCELLED` tetap berarti pembatalan oleh pengguna; status lama tidak diubah secara massal.
- Persetujuan dan pembelian tidak menambah stok. Penerimaan fisik tetap memilih `GoodsPurchase` yang disetujui; penerimaan sebagian dan penuh tetap bekerja seperti sekarang.

## Data lama dan transisi

- Daftar Belanja dan Pembelian Barang yang sudah ada tetap dapat dilihat di riwayat gabungan. Pembelian lama yang masih `PENDING` tetap dapat diproses di sana memakai aturan lama sampai selesai.
- Daftar Belanja lama yang sudah `APPROVED` tetapi belum memiliki Pembelian Barang menampilkan tindakan **Lengkapi Pembelian Lama**. Alur ini mempertahankan pemeriksaan khusus untuk Pengeluaran dan stok warisan; jika ada Pengeluaran lama, penggantiannya terjadi atomik agar tidak dihitung dua kali.
- Permohonan lama yang sedang diproses per produk tetap memakai endpoint lama. Permohonan baru tidak bisa diproses lewat endpoint tersebut.
- Tautan notifikasi, panduan visual, dan navigasi ke Pembelian Barang lama diarahkan ke tab Daftar Belanja. ID pembelian lama tetap dipakai saat membuka detail dan riwayat penerimaan.

## Penanganan kesalahan dan verifikasi

- Modal menahan pengiriman untuk jumlah atau harga tidak valid, produk duplikat, atau daftar tanpa produk yang disetujui. Kesalahan server dan konflik ditampilkan dalam bahasa Indonesia yang jelas tanpa menutup modal atau menghilangkan isian.
- Pengujian ditulis lebih dahulu dan diverifikasi gagal sebelum implementasi: hak akses API; finalisasi atomik; jumlah, harga, HPP, dan total Pengeluaran; pengiriman ulang dan konkurensi; penolakan; larangan endpoint lama bagi permohonan baru; keterbacaan riwayat lama; serta alur UI hingga penerimaan.
- Jalankan pengujian terkait, `pnpm lint`, dan `pnpm type-check`. Jangan menjalankan `pnpm build` atau mengelola proses `pnpm dev` milik pengguna.
- Perbarui Bantuan di `HelpContent.tsx`, panduan Supplier, katalog workflow AI bila alur panduan berubah, panduan visual, serta dokumentasi fitur di `markdown-files` agar semuanya menerangkan satu persetujuan.
