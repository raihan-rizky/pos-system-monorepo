# Faktur sementara: nomor dan waktu nota

## Rancangan yang disetujui

- No. Faktur mengikuti nomor otomatis yang sudah ada, dapat diketik manual, dan dapat dikembalikan dengan tombol **Gunakan otomatis**.
- Nomor otomatis yang ditampilkan adalah perkiraan; server menetapkan nomor unik saat menyimpan agar dua pengguna tidak memakai nomor yang sama.
- Nomor manual dipangkas spasinya, dibatasi 100 karakter, dan nomor yang sudah dipakai ditolak dengan pesan yang bisa ditindaklanjuti. Keunikan mengikuti batasan database yang berlaku.
- Nomor tampilan `001/PNW-TLD/15/X/2026` dan nomor mentah dengan urutan pendek `PNW-TLD-20261015-1` dinormalisasi ke `PNW-TLD-20261015-001`. Nomor yang tercetak sama tidak dapat lolos sebagai nomor berbeda.
- Nomor otomatis memakai urutan numerik terbesar pada tanggal tersebut ditambah satu, sehingga nomor manual yang melompati urutan tidak memblokir penyimpanan otomatis. Retry tetap menangani benturan penyimpanan bersamaan.
- Tanggal dan jam langsung terisi ketika form dibuka, menggunakan waktu server dalam Asia/Jakarta (WIB). Nilai awal tidak bergerak mengikuti jam dan tidak menimpa ketikan pengguna.
- Hak Owner/Admin untuk mengubah tanggal dipertahankan. Kasir/Sales tetap memakai waktu otomatis server.
- Cakupan: form pembayaran yang dapat menyimpan faktur sementara dan form nota penawaran; nomor, tanggal, dan jam yang tersimpan dipakai oleh riwayat dan cetakan.
- Bantuan dan katalog alur AI Assistant diperbarui.

## Verifikasi

Uji nomor manual, nomor kosong/otomatis, batas panjang, konflik nomor tanpa retry manual, retry nomor otomatis, pratinjau dengan izin yang benar, nilai awal WIB, dan form yang dibuka kembali tanpa menimpa edit. Jalankan regresi terkait dan TypeScript tanpa production build.

## Catatan lingkungan

Dokumentasi disimpan di folder proyek ini atas persetujuan pengguna karena drive D: tidak tersedia. Proxy Headroom tidak terhubung; pemeriksaan menggunakan keluaran terbatas.

Indeks GitNexus lama tidak dapat diperbarui (analyzer berhenti dengan exit 1). Impact untuk komponen dan handler yang sudah terindeks menunjukkan LOW, tanpa pemanggil langsung/proses terdampak yang tercatat. Pembacaan langsung menegaskan dua form menuju API draft. Simbol baru belum ditemukan indeks; batasan ini tetap berlaku pada hasil impact.

Perintah root `pnpm type-check` ternyata memanggil dependency build melalui Turbo; perintah dihentikan saat diketahui. Pemeriksaan selanjutnya memakai `pnpm --filter <paket> exec tsc --noEmit` langsung. Lifecycle dev server dikelola pengguna.

## Hasil verifikasi

- 128 tes pada 13 berkas lulus, meliputi API, form, waktu invoice, penomoran, nota penawaran, Bantuan, dan katalog AI Assistant.
- Uji browser dengan komponen React asli lulus: nomor otomatis/custom, reset otomatis, payload tanggal/jam/alasan, edit tidak tertimpa jam berjalan, pembukaan ulang dengan waktu baru, fallback ketika preview gagal, serta hak Sales.
- Tinjauan kode menemukan dan membantu menutup dua celah penomoran: duplikat format tampilan dan urutan manual yang tidak berurutan. Pemeriksaan ulang reviewer tidak menemukan masalah material tersisa.
- `git diff --check` lulus.
- Pemeriksaan TypeScript langsung untuk web, admin, UI, database, dan product-import-worker lulus. Pemeriksaan web diulang setelah perubahan terakhir dan berakhir dengan exit 0.
- Tidak ada perubahan skema database atau dependensi.
