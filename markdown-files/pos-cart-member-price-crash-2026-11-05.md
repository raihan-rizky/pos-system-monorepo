# Perbaikan halaman error saat memilih produk Kasir

Tanggal: 2026-11-05 (Asia/Jakarta).

## Gejala dan penyebab

Pada situs produksi, mencari produk lalu memilih hasilnya menampilkan halaman
“Terjadi Kesalahan”. Console mencatat
`Harga jual harus berupa angka nonnegatif yang valid.` ketika CartSidebar
membulatkan acuan harga Agen.

Nilai Decimal dari API produk dikirim sebagai string JSON. Pemetaan produk ke
keranjang sudah mengubah harga normal menjadi number, tetapi belum mengubah
harga Agen dan Dinas. Validator pembulatan menolak string angka tersebut.

## Perubahan

- Normalisasi harga Agen dan Dinas menjadi number untuk produk biasa, varian
  terpilih, dan pilihan satuan di keranjang.
- Normalisasi harga member pada produk dan pilihan satuan ketika memulihkan
  keranjang lama dari sessionStorage.
- Pertahankan nilai null, undefined, dan nol serta perilaku acuan harga normal
  saat harga member belum diatur. Validator pembulatan tetap ketat.
- Alur penggunaan, izin, API, dan skema database tidak berubah.

## Verifikasi

Regression test `product-selection-cart-render.test.tsx` menggunakan data berbentuk
respons API dengan string harga. Test menjalankan mapper, perhitungan checkout,
dan render CartSidebar asli tanpa mock komponen. Sebelum perbaikan, tiga kasus
(produk biasa, varian, dan keranjang lama) gagal dengan exception produksi yang
sama. Setelah perbaikan, keenam kasus lulus, termasuk fallback null/undefined/nol.

Empat file test terarah (regression, mapper, CartSidebar, dan changelog) lulus:
44 test. ESLint pada seluruh file TypeScript yang diubah juga lulus. Pemeriksaan
TypeScript seluruh web lulus menggunakan Prisma client yang dibuat secara
terpisah dari schema main; client bersama di mesin ini masih tertinggal.

Verifikasi Chrome DevTools dengan ProductGrid, useCart, dan CartSidebar asli
berhasil menambahkan produk contoh dengan harga string ke keranjang. Acuan harga
Normal 43.000, Agen 37.000, dan Dinas 47.000 tampil sesuai data. Reload keranjang
lama dengan harga member string juga berhasil tanpa console error. Tidak ada
transaksi penjualan yang dibuat selama pemeriksaan.

Perintah terarah:

```powershell
pnpm --filter @pos/web exec vitest run features/pos-search/__tests__/product-selection-cart-render.test.tsx features/pos-search/__tests__/cart-mapping.test.ts features/pos-checkout/__tests__/CartSidebar.test.tsx
```

## Catatan lingkungan

Dokumen disimpan di `markdown-files` pada checkout aktif karena drive `D:` yang
tercantum dalam pedoman repositori tidak tersedia di mesin ini. Headroom MCP
dapat dipanggil, tetapi proxy kompresinya tidak terjangkau.
