# Izin RBAC untuk fitur terbaru — 2026-11-03

## Tujuan

Lengkapi perbaikan RBAC yang sudah disetujui dengan izin khusus untuk fitur terbaru di main, lalu commit dan push hasil terintegrasi ke main. Susunan halaman RBAC tetap sama. Pertahankan pekerjaan lokal lain dan perubahan terbaru main.

## Izin yang ditambahkan

| Resource | Aksi yang didukung | Akses lama sebagai nilai transisi |
| --- | --- | --- |
| transaction.custom_price | update: harga khusus nota | product.update |
| income.manual | create/read/update/delete: pemasukan manual | income dengan aksi yang sama |
| expense.manual_transfer | create/update/delete: belanja transfer manual | expense dengan aksi yang sama |
| expense.payable | create/read/update: hutang pemasok dan pembayaran | expense dengan aksi yang sama |
| expense.giro | read/update: daftar dan rekonsiliasi giro | expense dengan aksi yang sama |
| financial-report.export | read: unduh laporan keuangan | financial-report.read |
| product.import | create: impor produk, read: progres, update: impor kode supplier | product dengan aksi yang sama |
| inventory.bulk | read/update: perubahan stok massal dan impor stok | inventory dengan aksi yang sama |

Fitur yang hanya mengubah perhitungan atau tampilan, seperti valuasi HPP otomatis dan badge harga Agen/Dinas, tetap mengikuti izin data yang sudah ada. Jangan menambahkan kontrol yang tidak mempunyai pemeriksaan nyata.

## Aturan integrasi

- Izin eksplisit fitur baru mengalahkan nilai transisi, termasuk penolakan eksplisit.
- Grant khusus dapat diberikan tanpa memberikan edit master yang lebih luas. API dan UI memakai grant yang sama.
- Konfigurasi lama tetap efektif saat upgrade. Saat Owner menyimpan pengaturan baru, nilai transisi yang belum tersimpan dibekukan dalam transaksi yang sama agar perubahan izin umum berikutnya tidak diam-diam mengubah izin khusus yang tidak ditinjau.
- Hak Owner dan pembatasan bisnis dokumen, toko, kepemilikan job, penerimaan, serta persetujuan stok tetap berlaku.
- Tambahkan resource ke modul yang sesuai di katalog yang sama; pertahankan 25 modul dan layout.
- TDD untuk kompatibilitas, penolakan eksplisit, grant khusus, pemeriksaan API, dan kontrol UI. Jalankan impact GitNexus sebelum edit simbol lama.
- Perbarui Bantuan, alur AI, dan catatan perubahan. Migrasi audit tetap belum diterapkan pada sesi ini.

## Urutan kerja

1. Lengkapi core, katalog, dan materialisasi izin transisi dalam transaksi simpan.
2. Selaraskan harga custom, keuangan, ekspor, dan siklus impor pada UI serta API.
3. Periksa tes terkait, TypeScript, hook repository, dan cakupan GitNexus.
4. Commit hanya perubahan RBAC terintegrasi dan push main tanpa force push; jika main bergerak, gabungkan perubahan terbarunya dan validasi kembali.

## Panduan penggunaan

1. Sebagai Owner, buka **Pengaturan > RBAC**, pilih role, lalu cari modul. Susunan tetap 25 modul dengan 43 resource; hak Owner dan approval stok umum tetap terkunci.
2. Pilih izin sesuai tugas: **Harga khusus di nota**, **Pemasukan manual**, **Pengeluaran dan transfer manual**, **Pembayaran utang supplier**, **Pencairan giro**, **Ekspor laporan keuangan**, **Impor produk**, atau **Perubahan stok massal**. Akses halaman dan baca data tetap menjadi prasyarat. Harga nota terpisah dari edit master produk; `expense.read` tetap mengatur daftar dan ringkasan pengeluaran, sedangkan `financial-report.read` tetap mengatur tampilan laporan.
3. Untuk job impor latar belakang, berikan izin tindakan dan **Lihat progres**. Impor produk memakai `product.import.create`, impor kode supplier memakai `product.import.update`, dan perubahan manual/impor/grup stok massal memakai `inventory.bulk.update`. Izin baca progres saja hanya memantau; batal dan coba ulang memerlukan izin tindakan terkait. Klik **Review & Simpan**, tinjau perubahan sensitif, lalu periksa catatan akses.

Konfigurasi lama tetap mewarisi izin umum yang sesuai ketika baris fitur belum ada. Pada simpan pertama, nilai efektif sebelum perubahan ditetapkan secara atomik; penolakan eksplisit selalu berlaku. Pembatalan hasil impor memeriksa jenis batch tersimpan. Unggah bukti pengeluaran atau transfer manual memakai konteks buat/ubah yang sesuai dan memerlukan toko.

## Catatan rilis 2026-11-03 (WIB)

- Entri belum diterbitkan `rbac-effective-access` tetap memakai tanggal `2026-11-03` dan revision `1`, dengan ilustrasi RBAC yang sudah sesuai.
- Bantuan Owner, workflow `manage-rbac`, dan referensi `settings-rbac.md` menjelaskan izin fitur, prasyarat progres, serta transisi konfigurasi lama.
- Validasi terarah: 128 tes helper, 63 tes integrasi awal, 78 tes dokumentasi, dan 37 tes regresi pada tujuh suite yang diselaraskan lulus. Sesudah integrasi PWA, 83 tes Bantuan, workflow, changelog, dan banner lulus. Pemeriksaan TypeScript web, database, UI, dan worker impor lulus. Hook pre-push menjalankan suite repository penuh sebelum publikasi.
- Migrasi audit `20261103020000_rbac_permission_audit` tersedia tetapi belum diterapkan. Tabel audit harus tersedia sebelum memakai penyimpanan pengaturan RBAC yang baru.

## Catatan lingkungan

Checkout publikasi terpisah dibuat dari origin/main ea202db5. Delta awal RBAC: 54 berkas, tanpa konflik snapshot. Perbaikan POS ece33e47 dan banner PWA e410897b diintegrasikan; entri Catatan Perubahan keduanya dipertahankan. Drive D tidak tersedia; dokumentasi berada di markdown-files checkout ini. Index dan pekerjaan lokal checkout asal dipertahankan.

Headroom stats dipanggil; proxy kompresi tidak tersedia. Unggah source untuk kompresi sebelumnya ditolak oleh automatic approval review, sehingga pemeriksaan memakai output lokal terbatas. GitNexus memakai index lama; hasil staged menunjukkan risiko kritis pada otorisasi lintas fitur dan diperiksa bersama diff serta tes perilaku.

Perintah agregat `pnpm type-check` ternyata memicu dependency build Turbo, termasuk Next.js, lalu dihentikan. Pemeriksaan pengganti menjalankan `tsc` web langsung serta script type-check database, UI, dan worker secara berurutan. Server development dan database tidak diubah.
