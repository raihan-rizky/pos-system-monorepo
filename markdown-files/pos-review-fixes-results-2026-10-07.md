# Hasil perbaikan review POS — 7 Oktober 2026

## Ruang lingkup

Empat temuan review diperbaiki di branch `codex/fix-second-pos-review`, berdasarkan root cause dan tes regresi. Tidak ada perubahan skema database atau fitur baru.

| Temuan | Penyebab | Perbaikan |
| --- | --- | --- |
| Invoice offline bentrok | Nomor baru dihitung dari `createdAt` hari sinkronisasi, sedangkan transaksi memakai tanggal pembuatan offline | Ambil suffix terbesar pada prefix invoice di semua toko karena nomor unik global. Retry maksimal lima kali khusus konflik `invoiceNumber`; konflik mutation ID tetap memakai alur idempotensi existing. |
| Penerimaan draft kurang di laporan | Ledger menyimpan uang setelah dipotong total, lalu laporan mengurangi kembalian lagi | Simpan uang diterima bruto pada header dan ledger. Simpan kembalian terpisah; kontribusi pelanggan tetap dibatasi total transaksi. |
| Pembayaran campuran hilang saat approval | Modal mengirim ulang jumlah/metode yang sama, tetapi server menganggap field eksplisit sebagai perubahan tender | Pertahankan rincian tersimpan jika metode dan jumlah tetap setara. Metode/jumlah yang benar-benar berubah atau rincian baru tetap dapat mengganti tender. |
| Deadlock void/hapus lintas invoice | Stok dikunci mengikuti urutan item/jurnal yang dapat berlawanan pada invoice lain | Gunakan helper bersama: semua grup snapshot lebih dahulu, lalu ID produk terurut, sebelum increment stok. Target lock hilang ditolak sebelum perubahan stok. |

Tanggal asli offline dan kebijakan prefix tanggal yang sudah ada tetap digunakan; perbaikan ini hanya mengubah alokasi sequence. Data pembayaran historis tidak ditulis ulang otomatis. Jika draft berbayar lebih sudah difinalisasi sebelum patch ini, header/ledger lama perlu diaudit tersendiri; rincian tender yang sudah hilang tidak boleh ditebak.

## Pembuktian dan validasi

- RED: tujuh tes regresi gagal langsung pada perilaku yang direview. Satu tes guard tambahan juga gagal karena impor kelas error terlupa; impor diperbaiki dan hasil itu tidak dipakai sebagai bukti bug produksi.
- Pemeriksaan awal setelah perbaikan: 68 tes pada enam berkas lulus.
- Uji database PostgreSQL dengan schema fixture tersendiri: dua skenario baru lulus, untuk `VOID` dan `DELETE` serentak pada dua invoice tanpa pelanggan dengan dua produk dalam urutan berlawanan. Keduanya mengembalikan stok ke 10, membuat dua audit dan empat jurnal pengembalian, tanpa deadlock.
- Uji database pertama mengalami putus koneksi setelah satu skenario lama lulus. Retry khusus dua skenario baru berhasil; empat skenario lama tidak diklaim lulus ulang pada retry ini.
- Regresi lebih luas: 257 tes lulus, satu tes draft timeout 5 detik, enam tes integrasi opt-in dilewati. Seluruh 14 tes draft lulus saat diperiksa ulang dengan batas waktu 15 detik (eksekusi tes hanya 1,67 detik). Dengan pemeriksaan ulang tersebut, seluruh 258 tes unik yang dipilih sudah lulus; pengujian ini bukan run ulang seluruh suite proyek.
- ESLint seluruh sebelas berkas TypeScript yang berubah: lulus tanpa error atau warning.
- TypeScript: `pnpm --filter @pos/web type-check` selesai dengan exit code 0, tanpa error. Run pertama dihentikan untuk mengurangi perebutan memori; run akhir dijalankan setelah regresi dan lint selesai.
- `git diff --check`: lulus. Perubahan produksi dibatasi pada creator offline, approval draft, approval pending, dan helper pengembalian stok; tujuh berkas pengujian menambahkan regresi atau menyelaraskan fixture.

Fixture pengujian DELETE diperbarui agar menyediakan API lock bertag yang sekarang digunakan. Fixture layanan cetak memakai clock tetap dan menyamakan aktor mock RBAC, sehingga pengujian tidak bergantung pada jaringan waktu internet.

## Catatan pelaksanaan

- Headroom MCP tidak tersedia di tool session pada awal maupun akhir; output dibatasi dan kredensial tidak dicetak.
- GitNexus impact: dua handler approval LOW pada indeks, creator offline satu caller langsung/dua modul; helper reversal belum terindeks. Cakupan akhir unstaged ditandai HIGH (13 proses) dan dilaporkan ke pengguna. Hasil ini juga memasukkan AGENTS.md yang sudah berubah sebelum pekerjaan ini dan hunk yang berpindah karena wrapping retry. Review manual membatasi perubahan produksi pada empat fungsi terkait.
- Putus koneksi juga menggagalkan cleanup run database pertama. Setelah koneksi pulih, schema fixture tepat milik run tersebut diverifikasi dan dihapus; pemeriksaan `information_schema` memastikan tidak ada schema `pos_review_test_*` tersisa. Schema run retry dibersihkan oleh test teardown normal.
- Saat tahap perbaikan: tidak menjalankan build, tidak memulai/menghentikan dev server, tidak menulis data bisnis, dan tidak commit/merge/push.
- AGENTS.md, next-env.d.ts dan .serena milik pengguna dipertahankan. Dokumentasi disimpan di markdown-files proyek C: sesuai persetujuan sebelumnya.
- Halaman Bantuan dan workflow catalog tidak memerlukan perubahan karena patch ini memperbaiki perilaku existing tanpa fitur atau guided workflow baru.

## Integrasi ke main

- Pengguna meminta merge lokal ke `main` pada 7 Oktober 2026.
- `origin/main` sudah di-fetch. Main lokal berada empat commit di depan tanpa commit remote baru, sehingga integrasi perbaikan dapat memakai fast-forward.
- Isi commit dibatasi pada sebelas berkas kode/tes dan dua dokumen ini. Perubahan pengguna pada AGENTS.md, next-env.d.ts, dan .serena tidak dimasukkan.
- GitNexus `detect-changes --scope staged` telah dijalankan sebelum commit: 13 berkas, enam simbol terindeks, 13 proses, risiko HIGH. Batasan indeks dan review manual sama dengan tahap perbaikan.
- Headroom MCP tetap tidak tersedia; pemeriksaan memakai output terbatas.
- Suite penuh sebelum commit lulus: 408 berkas / 2.221 tes; dua berkas / 10 tes opt-in dilewati. Command: `pnpm exec vitest run --maxWorkers=1 --no-file-parallelism --testTimeout=15000 --hookTimeout=15000`; durasi 660,21 detik. Sepuluh tes yang dilewati tidak diklaim lulus pada run ini; dua skenario PostgreSQL baru sudah lulus terpisah pada tahap perbaikan.
- Pemeriksaan setelah fast-forward difokuskan pada enam berkas inti yang mencakup pembayaran, invoice offline, DELETE, dan service reversal. Tidak ada perubahan kode tambahan yang diperlukan untuk integrasi.
