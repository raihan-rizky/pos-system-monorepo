# Filter Satuan Produk

## Rancangan yang disetujui

Tambahkan dropdown **Satuan** di panel **Filter** halaman Produk. Pilihan awal
**Semua satuan** menampilkan katalog tanpa batasan satuan. Pilihan diambil dari
seluruh produk aktif toko, bukan hanya halaman yang sedang tampil. Filter bekerja
di server sebelum pagination dan dapat digabung dengan pencarian, kategori,
status stok, dan grup stok. Mengganti satuan kembali ke halaman pertama.

Dropdown mengikuti warna, jarak, dan tipografi panel filter yang ada supaya
pengguna mengenali kontrolnya. Gunakan select native berlabel agar dapat
dioperasikan dengan keyboard dan picker bawaan perangkat seluler.

## Rencana implementasi

- [x] Tulis dan jalankan tes gagal untuk filter API, cache/request hook, dan daftar satuan.
- [x] Tambahkan endpoint daftar satuan aktif dengan izin baca produk dan lingkup toko.
- [x] Teruskan satuan dari halaman melalui hook ke API; pertahankan cache lama tanpa satuan.
- [x] Filter data cache offline juga berdasarkan satuan.
- [x] Tambahkan dropdown, indikator aktif, reset, dan reset pagination.
- [x] Perbarui halaman Bantuan dan jalankan tes, lint, serta pemeriksaan tipe.

## Validasi

- 93 tes terkait lulus, termasuk pagination, query cache, izin dan lingkup toko,
  dokumentasi Bantuan, pemilihan produk, dan kompatibilitas pembaruan stok POS.
- Tes regresi memastikan membuka hasil satuan pcs secara online tidak menimpa
  varian dus yang sebelumnya tersimpan untuk penggunaan offline.
- Review kode tidak menemukan masalah tambahan setelah perbaikan cache.
- ESLint langsung pada halaman Produk, hook produk, dan kedua API produk lulus.
- Pemeriksaan browser Chrome pada lebar 1280 dan 375 piksel lulus: daftar satuan,
  pergantian filter kembali ke halaman pertama, Reset, dan Hapus semua filter.
- Tombol Filter memiliki label aksesibel pada ponsel dan status aria-expanded.
- Perintah lint dan type-check monorepo terhenti pada regenerasi Prisma karena
  DLL query engine terkunci di Windows (EPERM). Pemeriksaan aplikasi web
  dijalankan langsung dengan `pnpm --filter @pos/web exec tsc --noEmit`.
- Pemeriksaan TypeScript langsung selesai dengan tiga error di `.next-e2e/types/validator.ts`:
  route `(main)/api/products/stock-history` bukan module, serta signature params
  route internal-stock-out approve/reject tidak sesuai tipe Next.js.
  Tidak ada error yang dilaporkan pada kode filter satuan.
- Headroom stats dipanggil; proxy kompresi tidak terhubung. Output dibatasi.

## Catatan

Drive D: tidak tersedia pada lingkungan ini. Dokumentasi disimpan pada workspace
C:/Projects/pos-system-monorepo/markdown-files.
Ringkasan statistik tetap mengikuti pencarian dan kategori sebagaimana filter stok yang ada.
Tidak ada guided workflow AI Assistant yang ditambahkan atau diubah.
