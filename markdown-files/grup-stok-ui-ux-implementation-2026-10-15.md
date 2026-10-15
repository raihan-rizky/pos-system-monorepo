# Implementasi UI/UX Grup Stok

Tanggal: 15 Oktober 2026 (Asia/Jakarta)

Workspace: `C:\Projects\pos-stock-group-ux`, branch `codex/stock-group-friendly-ux`.

## Hasil implementasi

Pembuatan dan penggabungan memakai tahap **Tujuan grup**, **Satuan dan stok**, lalu **Tinjau dan simpan**. Preview memakai resolver yang sama dengan kontrak stok server dan menampilkan semua anggota terdampak. Stok produk tidak dijumlahkan. Saat bergabung ke grup yang ada, sumber mengikuti anggota acuan yang valid dan satuan acuan tujuan tetap; grup lama tanpa anggota acuan yang valid harus diperiksa sebelum dapat dilanjutkan.

Workspace menyediakan Ringkasan, Satuan, Harga, Tambah satuan, dan Riwayat. Draft dipertahankan saat gagal menyimpan atau berpindah panel; menutup draft meminta konfirmasi. Perubahan konversi menunggu detail otoritatif terbaru sebelum membuka kembali aksi stok/satuan. Kegagalan refresh menyediakan retry GET, dan pembukaan ulang setelah kegagalan tidak memakai detail konversi lama.

Riwayat memakai endpoint riwayat yang tersedia dengan filter dan pagination. Hanya aktivitas yang benar-benar tercatat dapat ditampilkan; implementasi tidak menjanjikan log harga yang tidak disediakan endpoint. HPP kosong ditampilkan sebagai belum diketahui dan tidak dianggap margin penuh. Tambah satuan membaca stok dari grup dan tidak menambah persediaan fisik.

Halaman produk meneruskan izin `inventory.update`, `product.update`, dan `product.create` sesuai aksi workspace. Tombol **Buat atau gabungkan grup stok** memerlukan `product.update` dan `inventory.update`, serta minimal dua produk terpilih. Metadata grup pada produk tetap diteruskan melalui selection yang tersedia untuk peringatan perpindahan grup.

**Tetapkan stok akhir** di workspace menyimpan jumlah akhir langsung dengan izin inventori. Pengajuan melalui **Inventaris > Update Stok > Banyak Produk (Massal)** tetap menunggu persetujuan owner, termasuk **Set stok akhir**. **Stok Bersama** menghitung persediaan fisik yang sama bagi semua satuan; **Stok Produk Ini** hanya membuat log produk dan tidak mengubah stok grup. Bantuan OWNER, ADMIN, INVENTORY serta workflow FAQ 5 dan 35 telah diselaraskan dengan perbedaan ini.

Formatter preview memakai ketelitian adaptif untuk angka kecil bukan nol. Kasus `1 dus = 100000 pcs` dengan sumber dus menampilkan `1 pcs = 0,00001 dus`, sementara format biasa dan payload resolver tetap sama.

## Verifikasi dan review

Perbaikan review akhir 15 Oktober: **Coba lagi** pada kegagalan awal detail kini mereset boundary query TanStack bersama boundary React. Regresi browser menghabiskan dua retry GET (tiga permintaan gagal), memulihkan respons server, lalu memastikan klik mengirim GET keempat dan membuka workspace asli. Tautan **Ajukan perubahan stok di Inventori** menuju `/inventory`, hanya diteruskan bagi izin update inventori dan akses halaman tersebut. Draft yang belum disimpan meminta keputusan sebelum navigasi; **Lanjutkan mengedit** mempertahankan input, sedangkan **Buang perubahan dan buka Inventori** melanjutkan navigasi.

Kedua regresi browser gagal sebelum perbaikan pada titik yang diharapkan (workspace tidak muncul setelah retry, tautan Inventori belum ada). Setelah perbaikan, fixture workspace lengkap lulus, termasuk izin tautan, navigasi bersih, pembatalan dan konfirmasi draft, tujuh regresi konversi sebelumnya, riwayat, keyboard, serta pemeriksaan mobile/desktop. Sebanyak 72 tes fitur di 12 berkas lulus; direct web TypeScript lulus dan ESLint untuk empat berkas berubah menghasilkan nol error serta lima peringatan console fixture. Ini adalah hasil pemeriksaan terarah; scoped re-review dan suite menyeluruh akhir tetap dimiliki controller, tanpa klaim kelulusan suite tersebut.

- Task 1: commit `c9eb015`, review disetujui.
- Task 2: `c9b158e`, perbaikan `5963f83` dan `bfef143`; review menemukan semua temuan penting telah ditangani. Sebelum Task 3, 72 tes fitur dan fixture browser workspace lulus, termasuk guard selama refresh, retry, dan pembukaan ulang setelah gagal.
- Task 3 RED: lima kegagalan pada pemeriksaan izin, katalog, Bantuan OWNER/ADMIN, dan penjelasan Inventori, dengan 38 tes lain lulus. Browser asli mereproduksi konversi kecil yang dibulatkan ke nol. RED tambahan role INVENTORY: satu gagal, 22 lulus sebelum panduannya diselaraskan.
- Browser pembuatan/penggabungan terbaru: lulus validasi tahap, Kembali/draft, pergantian sumber, preview, konfirmasi Escape, konflik dan retry, pencegahan submit ganda, pengembalian fokus, daftar/detail tujuan gagal lalu retry, kondisi kosong, perubahan satuan saat refresh, serta pembatalan loading tujuan. Kasus konversi `0,00001` ikut lulus. Browser memeriksa lebar 375px dan 1280px, target tombol minimal 44px, overflow, dan ketiadaan page error.
- `pnpm --filter @pos/web exec tsc --noEmit`: lulus.
- ESLint langsung untuk 11 berkas berubah: lulus, nol error; lima peringatan console pada fixture browser yang sudah ada. Variabel fixture yang tidak diubah nilainya diperbaiki menjadi `const`.
- `git diff --check`: lulus.
- Tes terarah fitur/katalog/panel/integrasi produk: 93 tes lulus di 15 berkas di luar HelpContent. HelpContent terbaru lulus 23/23 setelah expectation label diperbarui. Katalog setelah koreksi label tombol **Simpan konversi satuan** diuji lagi: 18/18 lulus.
- Pemeriksaan tambahan `help-visual-guide`: 25/27 lulus, termasuk resolusi target seluruh langkah; dua tes rendering menyeluruh melewati timeout (11 detik terhadap batas 5 detik; 70 detik terhadap 60 detik) saat suite controller berjalan bersamaan. Tidak ada assertion visual yang gagal. Suite final pada kode yang dibekukan lulus (2.580 tes, 10 dilewati, exit 0), termasuk pengujian rendering yang sebelumnya timeout saat berjalan bersamaan. Review akhir dan scoped re-review disetujui setelah perbaikan.

Screenshot fixture lokal: `output/playwright/group-creation/review-mobile.png` dan `review-desktop.png`; workspace tersedia pada `output/stock-group-workspace/`. Screenshot merupakan artifact pengujian lokal yang tidak dimasukkan commit. Pemeriksaan visual mobile menunjukkan ringkasan serta aksi utama dapat dibaca dan daftar dampak menggunakan area scroll yang tersedia.

## Batas verifikasi dan keputusan

Fixture memuat TSX asli, React, Tailwind, dan Chrome dengan API dalam memori. Ini bukan pengujian end-to-end aplikasi dengan autentikasi dan database toko. Tidak ada mutasi data toko nyata dan lifecycle server dev tidak diubah. Task 3 tidak menjalankan production build; pemeriksaan akhir menggunakan perintah paket langsung untuk menghindari dependensi Turbo `^build`. Pada baseline awal controller, root Turbo type-check sempat menarik Next build dan berhenti karena error route hasil generate yang sudah ada, sebagaimana dicatat pada ledger. Tidak ada perubahan schema, endpoint, dependency, atau aturan persetujuan.

Palet blue/slate dan font aplikasi dipertahankan, ENERGY 1 / RHYTHM 2 / MOTION 1. Bantuan menggunakan target visual yang sudah tersedia untuk tabel produk, ringkasan produk, aktivitas grup, dan pengajuan inventori; tidak menambahkan mock drawer baru.

GitNexus impact dijalankan sebelum edit. Panel stok massal memiliki satu pemanggil langsung InventoryWorkspace dan halaman Inventori sebagai pemanggil tidak langsung (LOW, dua simbol, nol proses). Halaman produk dan konstanta panduan/katalog/target visual dilaporkan LOW oleh indeks. Indeks tertinggal dari branch dan refresh sebelumnya gagal pada parse worker; nol pemanggil terindeks tidak dianggap bukti bahwa tidak ada pemanggil nyata. Formatter baru tidak terindeks, sehingga callsite lokal drawer diperiksa langsung. Detect changes sebelum commit: 11 berkas, sembilan simbol terpetakan, nol proses, LOW; sebagian nama simbol drawer berasal dari indeks lama.

Headroom stats dan compression dicoba; proxy `127.0.0.1:8787` tidak tersambung dan compression memakai `router:noop` tanpa penghematan. Setelah itu pembacaan dibatasi per bagian. Tool tidak tersedia lagi pada kelanjutan sesi 15 Oktober. Dokumentasi kanonis disalin ke `C:\Projects\pos-system-monorepo\markdown-files` sesuai lokasi yang disetujui; kode checkout utama tidak disentuh.

## Verifikasi final 15 Oktober 2026

Kode final: c716ce2. Perbaikan review: retry detail awal dan tautan Inventori ditangani; reviewer pengganti menyetujui scoped re-review setelah reviewer awal gagal autentikasi. Tidak ada temuan Critical/Important yang terbuka. pnpm test: exit 0, 457 berkas lulus, 2 dilewati; 2.580 tes lulus, 10 dilewati; durasi 1.239,41 detik. Peringatan Browserslist lama tetap dicatat. Percobaan suite sebelumnya terputus atau dibatalkan ketika perbaikan diperlukan; hanya run final yang lengkap dijadikan bukti kelulusan. TypeScript, ESLint, serta fixture Chromium pada kode final sudah lulus. Pengujian login/database toko nyata tetap belum dilakukan.
