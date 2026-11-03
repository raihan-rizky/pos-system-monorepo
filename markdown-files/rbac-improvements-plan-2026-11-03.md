# Perbaikan RBAC — rencana implementasi

## Spesifikasi yang disetujui

Perbaiki keseluruhan temuan audit RBAC dan tambahkan bantuan UX, dengan susunan halaman RBAC yang tetap sama: kartu role, matriks, pemilih modul, editor, dan review penyimpanan.

## Global Constraints

- Teks pengguna dalam bahasa Indonesia yang ramah; pertahankan layout halaman RBAC.
- Izin halaman, data, dan tindakan harus dijelaskan terpisah. Jangan menambah hak sensitif secara otomatis.
- Hak tersimpan tetap berlaku; jangan memperluas cakupan data Sales. Pertahankan pembatasan persetujuan draft permintaan Sales, invoice gabungan, dan nota percetakan yang diproses.
- Owner tetap memiliki akses penuh. Pengaturan RBAC dan approval inventory khusus Owner ditampilkan sebagai kebijakan terkunci.
- Terapkan TDD: lihat kegagalan yang relevan sebelum kode implementasi. Jalankan analisis dampak GitNexus sebelum mengubah simbol lama.
- Pertahankan semua perubahan lokal yang sudah ada, tanpa commit, deploy, migrasi database, build produksi, atau perubahan lifecycle server.

### Task 1: Selaraskan tindakan Riwayat

Perbaiki HistoryClientPage dan TransactionActionMenu agar Sales dengan izin eksplisit dapat memakai tindakan yang diizinkan. Gabungkan izin dan status dokumen untuk edit; VOIDED/REFUNDED tidak dapat diedit. Pertahankan aturan bisnis server dan pembatasan draft Sales yang berasal dari permintaan. Tambahkan atau perbarui tes perilaku desktop/mobile dan menu. Laporkan RED/GREEN dan dampak.

### Task 2: Lengkapi katalog dan UX editor RBAC

Buat satu sumber pengelompokan untuk seluruh 25 modul, metadata label sumber daya dan aksi yang benar-benar didukung, serta kebijakan khusus Owner. Pertahankan layout. Lengkapi navigasi desktop/mobile, pencarian modul, alasan izin belum efektif, petunjuk prasyarat Riwayat (halaman /history + transaction.read + transaction.update), dan pratinjau akses. Tampilkan kontrol yang dapat dipakai saja; detail teknis tetap tersedia. Tambahkan aria-expanded dan interaksi dialog keyboard/fokus. Jangan ubah kontrak penyimpanan pada task ini; task 3 mengintegrasikannya. TDD untuk jangkauan navigasi, lock, prasyarat, dan kontrol.

### Task 3: Penyimpanan, audit, dan otorisasi terbaru

Ganti penyimpanan snapshot penuh dengan perubahan izin beserta versi dasar. Validasi konflik secara atomik di database dan catat actor, waktu, serta perubahan dalam transaksi yang sama. Gunakan mekanisme database yang sudah tersedia bila memadai; jangan jalankan migrasi atau menambah dependensi. Konflik 409 harus menjaga edit lokal dan menawarkan review/muat ulang. Otorisasi API harus membaca konfigurasi terbaru dan gagal tertutup saat pembacaan gagal. Jangan mengizinkan hak yang gagal diverifikasi. TDD untuk revocation, validasi, konflik, dan audit/rollback.

### Task 4: Refresh izin dan halaman tujuan

Sinkronkan izin client pada fokus/tab aktif dan setelah penyimpanan; validasi di server tetap menentukan akses. Pilih halaman tujuan yang benar-benar diizinkan. Tampilkan keadaan tanpa akses dan kegagalan verifikasi dalam bahasa Indonesia dengan jalan keluar yang bisa dipakai. Hentikan fallback akses default ketika pembacaan konfigurasi gagal; default hanya untuk konfigurasi yang memang belum tersimpan. TDD untuk pencabutan izin, kegagalan, dan tujuan alternatif.

### Task 5: Dokumentasi dan verifikasi akhir

Perbarui Bantuan, katalog workflow AI, dokumentasi markdown bertanggal, dan Catatan Perubahan (2026-11-03 WIB, tiga langkah penggunaan, highlight ringkas, ilustrasi akurat). Jalankan tes terarah, TypeScript, lint relevan, dan review gabungan. Laporkan kegagalan dasar atau keterbatasan lingkungan dengan jelas.

## Keputusan kompatibilitas

- Bekerja di checkout aktif codex/receipt-automatic-rows karena perubahan Riwayat dan fitur lain yang sudah disetujui berada di sana; snapshot file yang disentuh dipakai untuk membatasi review task.
- Endpoint lama needs-revision yang tidak mempunyai izin aktif harus ditutup; jangan menghidupkan kembali workflow yang telah dihapus.
- Lokasi dokumentasi D: yang diminta tidak ditemukan saat pemeriksaan awal. Dokumentasi utama dibuat di markdown-files checkout aktif dan disalin ke lokasi yang diminta apabila tersedia izin tulis.
