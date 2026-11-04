# Kategori Gaji/Mingguan pada RP Bulanan

Tanggal: 2026-11-05 (Asia/Jakarta)

## Perilaku

- Hanya kategori khusus **Gaji/Mingguan** masuk kolom **Gaji / Mingguan** pada sheet RP bulan.
- Kategori **Gaji** bawaan dan kategori lainnya masuk kolom **Nilai**.
- Nominal memakai jumlah dikurangi kembalian, dihitung sekali, dan mengikuti pembagian yang sama pada rekap harian serta BERSIH.
- Pemilihan kategori tetap menggunakan form yang ada. Tidak ada checkbox, field database, migrasi, atau izin baru.
- Nama kategori dicocokkan lengkap, dengan normalisasi Unicode, huruf besar/kecil, serta spasi di sekitar garis miring. Keterangan yang menyebut gaji tidak mengubah kelompok laporan.

## Penggunaan

1. Buka Keuangan lalu tambah atau ubah pengeluaran. Pilih kategori Gaji/Mingguan; jika belum tersedia, gunakan Tambah kategori.
2. Simpan pengeluaran. Untuk memindahkan nominal ke Nilai, pilih kategori lain lalu simpan.
3. Buka Laporan Keuangan > Ekspor, pilih bulan dan tahun, lalu unduh ulang Excel. File yang sudah diunduh sebelumnya tidak berubah otomatis.

## Dampak pada data lama

Ekspor ulang memakai kategori yang saat ini tersimpan, termasuk untuk pengeluaran lama. Catatan lama dengan kategori Gaji bawaan tampil pada Nilai; catatan Gaji/Mingguan tampil pada kolom Gaji / Mingguan. Catatan di database tidak diubah oleh proses ekspor.

## Implementasi dan pemeriksaan

- Pemetaan berada di `apps/web/features/financial-report/helpers/monthly-report-core.ts` dan menggunakan normalisasi kategori yang sudah tersedia.
- Struktur workbook, kolom kelompok tersembunyi, dan rumus rekap yang sudah ada tetap dipakai.
- Tes regresi memeriksa kategori tepat dan mirip, Gaji bawaan, perubahan kategori, nominal bersih, duplikasi, penghapusan, batas periode, kolom RP, rekap, serta serialisasi Excel.
- Bantuan, katalog workflow AI Assistant, PANDUAN Excel, dan Catatan Perubahan menjelaskan aturan yang sama.

## Hasil verifikasi

- Baseline laporan: 44 tes lulus. Tes baru gagal pada implementasi lama (9 gagal, 6 lulus), lalu pengujian terfokus lulus setelah perubahan (43 lulus).
- Regresi laporan, Bantuan, workflow dan Catatan Perubahan: 403 lulus, 6 dilewati.
- Suite lengkap `pnpm test --pool=forks`: 5.717 lulus, 177 dilewati; 732 berkas lulus, 24 dilewati, tanpa kegagalan. Pool forks dipakai setelah percobaan threads mengalami kegagalan penghentian worker.
- Lint web (`pnpm --filter @pos/web lint`) dan pemeriksaan tipe seluruh paket (`pnpm --recursive --if-present --workspace-concurrency=1 run type-check`) lulus.
- Review independen tidak menemukan masalah material. Pemeriksaan diff memastikan perubahan hanya mencakup aturan kategori, tes, serta dokumentasi terkait.

## Catatan lingkungan

Lokasi dokumentasi D:\main_project\pos-system-monorepo\markdown-files tidak tersedia karena host ini hanya memiliki drive C:. Dokumen disimpan pada folder markdown-files di checkout repository yang digunakan untuk publikasi.

Headroom MCP tidak tersedia pada awal sesi lalu berhasil diakses. Indeks GitNexus root tidak memuat simbol laporan; upaya reindeks worktree gagal pada startup native worker. Analisis simbol spesifik menggunakan indeks laporan `pos-financial-giro` menemukan risiko LOW: satu pemanggil langsung dan API ekspor bulanan tidak langsung. Hubungannya dikonfirmasi kembali pada kode main saat ini.

Snapshot indeks laporan yang sama disalin ke indeks lokal worktree agar `detect_changes` memeriksa diff staged checkout publikasi. Hasilnya sembilan file dan empat simbol terpetakan, risiko LOW. Rentang baris builder pada snapshot lama tidak lengkap, sehingga perubahan builder juga diperiksa langsung lewat diff dan review independen.

Perintah lint root melalui Turbo sempat memicu build web sebagai dependensi dan segera dihentikan. Lint web dan type-check semua paket kemudian dijalankan langsung dan berhasil; server pengembangan di checkout asal tidak disentuh.
