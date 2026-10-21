# POS Percetakan dan Nota Tersimpan

Tanggal perubahan: 2026-10-20 (Asia/Jakarta).

Pembaruan baris otomatis dan lebar kolom: 2026-10-21 (Asia/Jakarta).

## Ringkasan

POS memakai tab ATK dan Percetakan. Percetakan memiliki subtab SPANDUK, PERCETAKAN, PLAT, STEMPEL, dan PRINT, masing-masing dengan daftar nota tersimpan. Satu nota yang diproses menjadi satu transaksi dan dapat ditemukan melalui kategori serta subkategori Riwayat.

Dokumen ini mengikuti [rancangan yang disetujui](percetakan-pos-design-2026-10-20.md) dan [rencana implementasi](percetakan-pos-implementation-plan-2026-10-20.md). Dokumentasi disimpan di checkout aktif karena lokasi D:/main_project/pos-system-monorepo/markdown-files tidak tersedia.

## Alur pengguna

1. Buka **Kasir > Percetakan** dan pilih jenis nota.
2. Klik **Buat Nota Kosong**. Draft langsung tersimpan; nomor otomatis tetap dapat diganti selama draft, dengan pengecekan nomor duplikat.
3. Isi pelanggan, tanggal, nama file/item, bahan, banyaknya, harga, dan keterangan langsung di lembar nota. Total dihitung otomatis. Gunakan **Tambah baris** pada **Baris dan hubungan stok** bila perlu.
4. Tunggu **Tersimpan** sebelum berpindah atau membayar. Jika **Gagal menyimpan**, gunakan **Coba simpan lagi**. **Muat ulang versi tersimpan** meminta konfirmasi sebelum mengganti perubahan lokal. Konflik perubahan tidak menimpa nota lain secara diam-diam.
5. Klik **Bayar / DP** dan ikuti modal Pembayaran yang tersedia. Metode, pelanggan untuk tempo/DP, shift, serta izin mengikuti aturan transaksi aplikasi.
6. Klik **Cetak / PDF**, lalu pilih **Cetak** atau **Unduh PDF**. Draft dapat dicetak tanpa membentuk penjualan atau mengurangi stok. Setelah nota diproses, isinya tetap; cicilan berikutnya mengikuti transaksi.
7. Untuk membuka kembali, pilih nota pada daftar subtab asal. Di ponsel gunakan **Daftar nota**. **Perkecil nota** dan **Perbesar nota** mengatur tampilan tanpa mengubah ukuran hasil cetak.

## Barang dan stok

- Nama item/file dan bahan boleh diketik bebas; tidak perlu membuat entri katalog.
- Baris yang perlu memakai persediaan dapat dihubungkan melalui **Baris dan hubungan stok > Hubungkan stok**. Cari produk/bahan dan isi **Jumlah pemakaian** dalam satuan yang ditampilkan.
- Jumlah pemakaian adalah total pemakaian untuk baris itu. Contoh: baris berisi 3 banner dengan total pemakaian 6 meter dihubungkan ke stok dengan jumlah 6 meter.
- Autosave dan pencetakan draft tidak mengurangi stok. Stok bahan terkait dikurangi ketika transaksi berhasil, dengan perlindungan agar pengulangan checkout tidak mencatat penjualan atau pemakaian kedua.
- Satuan bahan dan keanggotaan grup stok diperiksa ulang di bawah kunci baris saat checkout/persetujuan. Perubahan di tengah proses menghasilkan konflik dan seluruh transaksi dibatalkan secara atomik. Urutan penguncian mengikuti pelanggan, transaksi, grup, lalu produk.
- Banyaknya pada checkout mengikuti aturan jumlah bulat positif. Selama draft, isian yang belum selesai boleh kosong.

## Format nota

| Jenis | Ukuran dan isi |
| --- | --- |
| SPANDUK | 215 × 110 mm horizontal; tinggi baris mengikuti isi; nomor nota, nama file, bahan, banyak, harga, jumlah, DP, sisa, dan janji selesai |
| PERCETAKAN, PLAT, STEMPEL, PRINT | A5 148 × 210 mm tegak; tinggi baris mengikuti isi; nomor sebenarnya menggantikan nomor contoh |

Artwork mengikuti dua PDF Toko Teladan yang diberikan pengguna. Baris tambahan memakai halaman lanjutan; total keseluruhan ditempatkan di halaman terakhir. Kontrol editor tidak masuk ke hasil cetak. Cetak ulang dibuka dari transaksi dengan template asal dan pembayaran terbaru.

Nama item/file dan bahan membungkus otomatis pada ukuran huruf semula. Satu item memakai satu kotak yang meninggi tanpa garis horizontal di tengah teks; nilai kolom lain sejajar atas dan dicetak sekali. Pada A5, bahan berada di bawah seluruh nama. Ruang baris kosong di akhir draft dipakai sebelum menambah halaman, tanpa menghapus data tersimpan. Teks item yang sangat panjang berlanjut pada halaman nota berikutnya, dengan nomor item tetap dan total hanya di halaman terakhir. Kolom tambahan di luar baris item masih dapat memakai lampiran.

Geser pembatas header untuk mengatur lebar setiap kolom saat nota dapat diedit. Lebar tabel tetap, dengan batas minimum tiap kolom. Pembatas juga bisa difokuskan lewat Tab lalu digeser dengan ArrowLeft/ArrowRight; tahan Shift untuk langkah lebih besar. **Reset lebar kolom** mengembalikan ukuran bawaan. Lebar tersimpan per nota melalui penyimpanan yang sudah ada; pada draft, tunggu **Tersimpan** sebelum berpindah. Pada A5, bahan mengikuti lebar kolom Nama Barang. Preview dan PDF memakai lebar, pembungkusan, serta batas baris yang sama. Lihat [panduan baris otomatis dan lebar kolom](nota-baris-otomatis-2026-10-21.md). Pratinjau ulang nota yang sudah diproses mengambil pembayaran/status terbaru dari server.

## Filter Riwayat

| Kategori transaksi | Subkategori |
| --- | --- |
| Semua Kategori | Nonaktif sampai kategori utama dipilih |
| ATK | Kategori produk sebenarnya dari katalog toko |
| PERCETAKAN | SPANDUK, PERCETAKAN, PLAT, STEMPEL, PRINT |

- Mengubah kategori utama mengosongkan subkategori dan kembali ke halaman pertama. Mengubah subkategori juga kembali ke halaman pertama.
- ATK mencocokkan transaksi yang memiliki setidaknya satu item pada kategori produk terpilih, termasuk keranjang dengan beberapa kategori.
- Nota Percetakan tidak masuk ATK meskipun menggunakan bahan stok dengan kategori produk yang sama.
- Transaksi layanan cetak lama dikenali melalui `printingServiceId`; subkategorinya tidak ditebak dari nama. Transaksi produk lama atau transaksi reguler kosong tanpa layanan cetak tetap masuk ATK.
- Pencarian juga mencocokkan nomor nota Percetakan. Filter dapat digabung dengan pencarian, tanggal invoice, status, dan filter Riwayat lainnya.
- Hasil dan jumlah pagination menggunakan kondisi server yang sama. Daftar komputer dan ponsel menampilkan kategori, subkategori bila tercatat, serta nomor nota.
- Isi, tanggal, dan identitas nota yang sudah diproses tidak diubah melalui editor transaksi umum. Penghapusan fisik disembunyikan; pembatalan/refund memakai alur status transaksi agar riwayat nota tetap tersedia. Approval memakai nominal dan item tersimpan.

## Kontrak API dan penyimpanan

Fitur berada di `apps/web/features/printing-receipts`.

- `GET/POST /api/printing-receipts`: daftar terbatas ke toko/subtab, pencarian dan pagination; pembuatan draft kosong.
- `GET/PATCH/DELETE /api/printing-receipts/[id]`: baca, autosave dengan revision, serta penghapusan draft. Data toko lain tidak dapat dibaca atau diubah.
- Izin create, update, dan delete diperiksa terpisah. SALES memakai `transaction.request` untuk pembuatan/perubahan; hapus draft tetap membutuhkan `transaction.delete`.
- Checkout memakai `POST /api/transactions` dengan `printingReceiptId` dan `printingReceiptRevision`. Server membaca draft yang tersimpan dan menghitung ulang nominal. Relasi unik dokumen/transaksi menjaga satu nota menjadi satu transaksi.
- `GET /api/transactions` menerima `transactionCategory=ATK|PERCETAKAN`; `categoryId` berlaku untuk ATK; `printingSubcategory` berlaku untuk PERCETAKAN. Pilihan anak yang tidak sesuai kategori utama diabaikan. Tanpa kategori utama, filter anak tidak diterapkan.
- GET daftar dan detail transaksi menyertakan `printingReceipt: {id, subcategory, number}` bila tersedia. Field `transactionCategory` dan `printingSubcategory` bersifat nullable agar data lama tetap terbaca.
- Migration aditif: `packages/db/prisma/migrations/20261020080000_printing_receipts/migration.sql`. Migrasi ini sudah diterapkan sukses pada database development melalui `.env.development`, setelah dipastikan hanya migrasi ini yang tertunda dan database berbeda dari produksi. Lingkungan deployment lain tetap mengikuti prosedur migrasi yang berlaku; sesi agen tidak menjalankan operasi database produksi.

## Panduan dan pengumuman

- Bantuan Owner, Admin, Kasir, dan Sales memuat panduan **Membuat Nota Percetakan** dengan lima langkah dan target visual yang dicatat eksplisit.
- Visual panduan menampilkan subtab, pembuatan kosong, lembar asli, pembayaran, dan filter kategori/subkategori. Data contoh diberi keterangan.
- AI Assistant menambah workflow `faq-q40-printing-receipts`; FAQ sumber juga diperbarui.
- Panduan penjualan umum mengarahkan barang ke ATK dan pesanan cetak ke nota. Panduan persetujuan/tanggal menjelaskan bahwa nota diproses mempertahankan isi, nomor, dan tanggal; akses panduan Sales mengikuti izin pengajuan transaksi.
- Catatan Perubahan menambah `printing-receipts-pos`, tanggal WIB `2026-10-20`, revision `1`, highlight singkat, dan tepat tiga langkah. Screenshot editor sebenarnya memakai data contoh pada `apps/web/public/images/changelog/nota-percetakan.png`; ilustrasi berlabel tetap tersedia.

## Verifikasi sesi

- TDD filter: tiga kegagalan parameter serta lima kegagalan API diamati sebelum implementasi; mencakup klasifikasi legacy, item ATK dengan beberapa kategori, bahan stok Percetakan, jumlah dan pagination.
- TDD tampilan: dua kegagalan render diamati untuk filter induk/anak dan identitas nota komputer/ponsel.
- Uji terarah filter serta regresi status Tempo dan Surat Jalan: **4 berkas, 29 pengujian lulus**.
- TDD panduan: delapan kegagalan awal diamati untuk empat role, visual, workflow baru, pengumuman, dan jumlah FAQ.
- TDD izin CRUD: tes gagal menunjukkan pengguna dengan izin create saja masih dapat mengubah/menghapus draft. Perbaikan memisahkan izin per aksi; **19 tes API nota lulus**.
- TDD integritas stok mencakup perubahan satuan dan grup sebelum checkout/persetujuan, penguncian ulang, dan rollback. **35 tes backend terarah lulus**.
- Regresi tanggal pembayaran terlebih dahulu gagal ketika modal memakai tanggal hari ini untuk nota bertanggal lain. Modal kini mengikuti tanggal nota dan mempertahankan aturan alasan tanggal mundur untuk Owner/Admin.
- Rangkaian gabungan terakhir: **68 berkas, 747 pengujian lulus** melalui Vitest, mencakup domain/editor/PDF, API nota, transaksi, Riwayat, panduan, workflow, changelog, checkout, dan grup stok. Run awal menemukan dua ekspektasi panduan lama serta satu timeout; ekspektasi diselaraskan dengan hasil implementasi dan run akhir memakai batas waktu 30 detik per tes / 60 detik per hook tanpa mengubah konfigurasi global.
- Setelah perapian lint pada tes izin, komentar artwork, dan keluaran harness, **21 pengujian izin/render lulus kembali**. Harness browser juga dijalankan ulang dan kembali lulus pada kedua ukuran.
- Harness browser workspace lulus pada lebar **1280 dan 390 piksel**: buat/isi/simpan nota, Enter pada input, hubungan stok, pergantian subtab, retry autosave/pembayaran, penguncian nota diproses, pembayaran/status terbaru, hapus oleh pengguna dengan izin delete saja, dan pergantian pengguna pada toko yang sama. Harness menggunakan komponen workspace sebenarnya dengan API/layanan simulasi. Koneksi browser ke server pengguna tidak tersedia, sehingga sesi tidak mengklaim uji menyeluruh langsung pada server tersebut.
- PDF SPANDUK, A5, halaman lanjutan, lampiran teks panjang, nomor panjang, dan status pembatalan diperiksa secara visual memakai data contoh. Artwork sumber tetap dipertahankan; header tanggal/nomor contoh ditutupi sebelum nilai sebenarnya ditampilkan.
- Uji regresi popup Percetakan menangkap ikon yang belum terdaftar pada peta popup. Setelah perbaikan peta ikon, uji render popup tersebut lulus (1 pengujian terpilih; 7 lainnya tidak dipilih pada run ini).
- Pemeriksaan dampak GitNexus terhadap halaman Riwayat, kedua GET transaksi, HelpContent, PosPreview, HistoryPreview, serta katalog workflow menghasilkan LOW. Penyusun parameter memiliki satu pemanggil langsung (`fetchTransactionHistory`) dan satu pemanggil tidak langsung (`queryFn`), tanpa proses terindeks terdampak. Simbol ChangeIllustration belum tersedia dalam indeks; referensi lokal menunjukkan pemanggil ChangeCard.
- GitNexus tidak memiliki FTS pada lingkungan ini; analisis simbol langsung tetap digunakan. Indeks tidak dibangun ulang.
- Headroom stats dipanggil. Proxy lokal tidak dapat dihubungi; percobaan kompresi ditolak automatic approval review karena berisiko mengirim isi privat repository ke tujuan yang belum terverifikasi. Sesi dilanjutkan dengan cuplikan lokal terbatas tanpa ekspor pengganti.
- Tidak menjalankan production build, commit/push, atau mengelola lifecycle server pengembangan.

Pemeriksaan TypeScript akhir `pnpm --filter @pos/web type-check` selesai dengan exit code 0 setelah perapian terakhir. ESLint terhadap **68 berkas terkait** selesai tanpa error atau warning. `git diff --check` juga selesai dengan exit code 0. Branch tetap `codex/percetakan-nota`, HEAD `9838c2a`; seluruh perubahan diserahkan lokal tanpa commit/push.

## Pengujian lanjutan dan persiapan main — 2026-10-20

Pengguna kemudian meminta variasi pengujian tambahan dan kesiapan push ke main. Tahap ini menambah **120 kasus Vitest** dan **12 kombinasi browser** untuk respons tertunda. Rincian cakupan dan bukti pemeriksaan tersedia di `percetakan-test-readiness-2026-10-20.md`.

Perbaikan yang mengikuti kegagalan RED:

- Pesan validasi checkout mempertahankan nomor baris asli meskipun baris sebelumnya kosong.
- Kelanjutan permintaan dari pengguna, toko atau izin yang sudah berubah tidak menghidupkan kembali editor/autosave sesi lama.
- Endpoint pajak menolak perubahan snapshot nota diproses pada pembacaan awal maupun pembacaan ulang terkunci.
- Total setelah pajak, diskon, jumlah pembayaran, dan rincian pembayaran saat persetujuan harus berada dalam kapasitas Decimal(12,2). Penolakan terjadi sebelum penulisan pelanggan, transaksi, pembayaran atau stok; nilai maksimum yang sah tetap diterima.

Integrasi memakai `origin/main` terbaru (`8d66cc9` pada pemeriksaan ini). Commit main tersebut sudah mengganti tampilan Margin menjadi Markup. Dua tes katalog lama diselaraskan dengan format rupiah, persentase terhadap HPP, dan HPP nol yang memang diterapkan main; berkas inventory pengguna tidak diubah untuk penyesuaian ini. Sebelas tes katalog/markup terarah lulus.

Tinjauan kode tambahan memberikan **GO**. GitNexus mendeteksi 79 berkas teks, 55 simbol, dan 24 alur dengan **risiko gabungan critical** sebelum penambahan koreksi tes katalog. Cakupannya sudah ditinjau: alur POS, pembayaran, persetujuan, Riwayat dan dependensi RBAC yang ada. Tidak ada perubahan implementasi RBAC atau berkas inventory di cakupan fitur; batas indeks/FTS tetap berlaku. Hasil pemeriksaan seluruh suite dan commit integrasi dicatat pada dokumen kesiapan setelah pemeriksaan selesai.

Tahap persiapan ini tidak menjalankan push remote, production build, perubahan database produksi, atau lifecycle server pengguna. Empat berkas inventory dipotret hash-nya agar isi lokal dapat dipastikan tetap utuh.

Verifikasi lanjutan selesai: **506 berkas / 3.599 tes lulus**, dengan dua berkas / sepuluh tes opt-in dilewati; ESLint pada **72 berkas tanpa error/warning**; dan pemeriksaan TypeScript web langsung **exit 0**. Harness browser tetap lulus pada 1280 dan 390 piksel dengan layanan simulasi. Dua tes katalog yang disesuaikan juga tercakup dalam run suite lengkap terakhir. Tidak ada perubahan dependensi atau konfigurasi Vitest.

Commit fitur `ab70cb2` memuat 83 berkas yang dipilih eksplisit. Hasil integrasi lokal menyertakan main `8d66cc9` tanpa konflik, dan main lokal disiapkan untuk push; branch fitur tetap tersedia. Isi empat berkas inventory yang sudah ada dipastikan utuh dengan SHA-256. Dua perubahan inventory pengguna yang belum ada di main tetap berada di luar commit. Rincian verifikasi dan cakupan GitNexus critical yang sudah ditinjau tercatat pada dokumen kesiapan. Belum ada push remote.
