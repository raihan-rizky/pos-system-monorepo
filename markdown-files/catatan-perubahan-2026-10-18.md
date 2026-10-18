# Catatan Perubahan Visual

Tanggal: 18 Oktober 2026 (WIB)

## Pengalaman pengguna

- **Lainnya → Catatan Perubahan** membuka `/changelog`, tersedia untuk seluruh peran secara default dan tercakup dalam pengaturan RBAC.
- Riwayat memuat semua entri yang sudah terbit, terbaru di atas. Filter **7 hari terakhir** memakai hari ini dan enam hari kalender sebelumnya di Asia/Jakarta; tanggal mendatang disembunyikan.
- Popup **Apa yang baru** muncul setelah 1,5 detik ketika ada entri terbaru yang belum dilihat. Popup menunggu dialog lain selesai, dan tidak otomatis muncul di halaman arsip.
- Satu pembaruan ditampilkan per langkah popup, dengan panah sebelumnya/berikutnya, tautan arsip, dan tombol **Sudah lihat**.
- Setiap pembaruan memiliki gambar dominan, judul singkat, ringkasan manfaat, dan tiga langkah visual. Screenshot dapat diperbesar. Jika gambar gagal dimuat, ilustrasi berlabel menggantikannya.
- Tautan ke fitur hanya ditampilkan jika pengguna mempunyai izin halaman tujuan. Catatan perubahan sendiri tidak memberikan izin menjalankan fitur tersebut.

## Alur penggunaan

**Lainnya → Catatan Perubahan → Lihat screenshot/ilustrasi → Ikuti tiga langkah → Buka fitur**

**Masuk aplikasi → Ada pembaruan belum dilihat → Apa yang baru → Panah berikutnya → Sudah lihat**

## Pemeliharaan manual

Sumber tunggal: `apps/web/features/changelog/data/changelog.ts`.

1. Tambahkan entri untuk setiap fitur besar, peningkatan substansial, atau perbaikan besar dalam pekerjaan yang sama.
2. Isi `id` unik, `revision`, tanggal rilis asli `YYYY-MM-DD` berdasarkan WIB, `kind`, `area`, judul, ringkasan maksimal dua kalimat, rute tujuan, jenis ilustrasi, dan tepat tiga langkah.
3. Bila tersedia, simpan screenshot nyata yang dipotong sesuai bagian fitur di `apps/web/public/images/changelog/`, lalu isi `screenshot.src` dan alt text. Hindari data pelanggan, HPP, ringkasan keuangan, dan kredensial.
4. Verifikasi manfaat dan langkah terhadap implementasi. Jangan mengubah tanggal entri lama agar terus muncul; arsip tidak dihapus setelah tujuh hari.
5. Naikkan `revision` hanya jika pengumuman memang perlu ditampilkan kembali. Perbarui Bantuan dan katalog workflow AI Assistant bila alurnya berubah.

Screenshot awal `pos-unit-stock.webp` diambil dari halaman Kasir yang berjalan, menampilkan stok dan konversi satuan pada kartu produk. Ilustrasi lainnya sengaja diberi label agar tidak dianggap screenshot.

## Keputusan tampilan

- Gaya editorial yang ringkas: gambar besar dan judul menjadi fokus, bukan paragraf panjang.
- Warna brand biru dan token surface mengikuti aplikasi; tidak menambah tema atau font baru.
- Layout dua kolom pada desktop berubah menjadi satu kolom di ponsel; langkah mengikuti lebar layar.
- Motion dibatasi pada hover gambar dan warna kontrol, dengan dukungan reduced motion.
- ENERGY 2 / RHYTHM 2 / MOTION 1. Variasi ilustrasi mengikuti isi fitur, bukan dekorasi acak.

## Penyimpanan dan aksesibilitas

- Status dilihat memakai key `pos:changelog:seen:<userId>` di localStorage. Penyimpanan terpisah per akun dan browser, tidak disinkronkan lintas perangkat.
- Jika browser memblokir localStorage, status dipertahankan di memori selama komponen tetap terpasang. Setelah reload, popup bisa muncul lagi.
- Dialog native memakai `showModal()`: fokus terkunci, Escape tersedia, dan fokus kembali ke pemicu. Backdrop dismissal mempunyai fallback untuk browser tanpa `closedby`.
- Entitas yang ditandai dilihat adalah entri yang ada ketika popup dibuka; perubahan lain dengan id/revision baru tetap dapat diumumkan.

## Verifikasi

- Unit dan render test: batas tujuh hari WIB, rollover tengah malam, tanggal invalid/mendatang, urutan arsip, revision, saved state rusak, akses tautan, empty state, menu, Bantuan, dan workflow.
- Browser test terisolasi memakai komponen asli dan CSS aplikasi dengan adapter role/navigation lokal. Tidak terhubung ke database atau menulis data toko.
- Perintah: `pnpm --filter @pos/web test features/changelog/__tests__/changelog.test.tsx`.
- Browser: `pnpm --filter @pos/web exec playwright test --config features/changelog/browser/playwright.config.ts`.
- Server Next.js dan folder `.next` tidak digunakan oleh harness browser ini.

Hasil akhir: 73 tes unit/regresi pada lima file lulus; 11 tes Catatan Perubahan dijalankan ulang setelah penyempurnaan tampilan popup dan tetap lulus. Empat tes browser lulus, termasuk tombol navigasi yang terlihat pada ponsel, zoom bertingkat, pemulihan fokus, status per akun, dan fallback penyimpanan. Type-check aplikasi web, ESLint fitur, serta `git diff --check` lulus. GitNexus melaporkan risiko rendah dan nol proses terdampak untuk perubahan terindeks; laporan juga mencakup pekerjaan kategori dari sesi lain.

Headroom dipanggil pada awal/akhir sesi dan untuk kompresi keluaran. Proxy Headroom lokal dilaporkan tidak dapat dihubungi; keluaran dibatasi selama pemeriksaan.

## Lokasi dokumentasi

Drive `D:` tidak tersedia pada sesi Windows ini. Dokumentasi disimpan di `C:\Projects\pos-system-monorepo\markdown-files` pada checkout aktif sebagai pengganti lokasi `D:\main_project\pos-system-monorepo\markdown-files` yang disebut AGENTS.md.
