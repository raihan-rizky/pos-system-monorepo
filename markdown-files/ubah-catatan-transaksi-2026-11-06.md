# Desain: Ubah Catatan Transaksi

Tanggal: 2026-11-06 (WIB)

Status: Implementasi pilihan B

## Tujuan

Pengguna yang dapat mengubah transaksi reguler dapat menambah, mengganti, atau menghapus catatan transaksi dari modal **Ubah Transaksi** di halaman Riwayat. Catatan yang disimpan juga digunakan saat struk atau invoice yang berkaitan dicetak ulang.

## Pilihan yang dibahas

1. **Memperbarui catatan transaksi yang sudah ada — dipilih.** Riwayat dan dokumen memakai nilai catatan yang sama; tidak memerlukan kolom basis data baru.
2. **Membuat catatan khusus Riwayat.** Riwayat dan dokumen memiliki catatan terpisah; memerlukan penyimpanan tambahan dan catatan di dokumen tetap menggunakan nilai sebelumnya.

Untuk tata letak, pengguna memilih **B**: kolom **Catatan Transaksi** berada setelah daftar dan total produk, sebelum tombol **Simpan** dan **Batal**.

## Perilaku

- Kolom menampilkan catatan pengguna saat ini, mendukung beberapa baris, dan boleh dikosongkan. **Simpan** menerapkan perubahan; **Batal** membuang perubahan yang belum disimpan.
- Hasil perubahan terlihat di Riwayat dan dipakai oleh tampilan serta pencetakan ulang dokumen yang sudah menggunakan catatan transaksi.
- Izin tetap mengikuti `transaction:update`. Cakupan transaksi dan status yang dapat membuka modal mengikuti aturan edit yang sudah ada; nota percetakan yang diproses dan transaksi gabungan tetap menggunakan alurnya sendiri.
- Catatan pengguna berbagi penyimpanan dengan penanda divisi dan anotasi pelunasan dari sistem. Penanda tersebut tidak ditampilkan sebagai teks yang dapat diedit dan harus dipertahankan saat teks catatan diubah atau dihapus.
- Format penanda divisi dan pelunasan otomatis tidak dapat ditambahkan melalui teks catatan karena format tersebut digunakan oleh sistem.
- Catatan hanya dikirim sebagai perubahan ketika pengguna benar-benar mengubahnya. Penyimpanan harus menjaga data terbaru dari perubahan bersamaan; jika tidak dapat dilakukan dengan aman, pengguna diminta memuat ulang sebelum mencoba kembali.
- Mengubah catatan saja tidak memproses ulang item produk. Perubahan produk yang memang dilakukan di modal tetap mengikuti alur penyimpanan dan penanganan kesalahan yang ada.
- Mekanisme riwayat perubahan nota untuk Sales tetap mencatat perubahan catatan sesuai aturan yang sudah berlaku.

## Batasan dan pekerjaan pendukung

- Tidak menambah izin, kolom basis data, atau migrasi baru. Catatan pelanggan dan alur edit nota percetakan yang sudah diproses berada di luar cakupan.
- Perbarui Bantuan dan katalog alur AI Assistant agar cara mengubah catatan mudah ditemukan. Tambahkan catatan perubahan produk jika perubahan ini memenuhi kriteria rilis yang berlaku.
- Jangan menjalankan `pnpm build` atau mengubah siklus server pengembangan pengguna.

## Implementasi

- Modal mencatat nilai catatan awal untuk mendeteksi perubahan bersamaan. Jika data sudah berubah, penyimpanan ditolak dan pengguna diminta membuka kembali transaksi.
- Catatan pengguna digabung dengan penanda divisi dan anotasi pelunasan yang sudah tersimpan. Pembayaran piutang juga memeriksa catatan yang dibacanya agar tidak menimpa perubahan lain.
- Jika produk tidak berubah, modal tidak mengirim pembaruan item. Setelah catatan disimpan, cache transaksi yang bersangkutan diperbarui dan data Riwayat dimuat ulang.

## Catatan lokasi dokumentasi

Panduan repositori menyebut `D:\main_project\pos-system-monorepo\markdown-files`, tetapi drive `D:` tidak tersedia di lingkungan kerja ini. Dokumen rancangan ini disimpan di `markdown-files` pada worktree fitur `C:\Users\Raihan Rizki\.codex\worktrees\transaction-note-edit\pos-system-monorepo`.
