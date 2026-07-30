# Implementasi Prioritas Harga Khusus di Pembayaran

Tanggal: 30 Juli 2026

## Ringkasan

Matching Harga Khusus sekarang menjadi prioritas default di atas Harga Agen dan
Harga Dinas. Untuk pelanggan Agen atau Pemerintah, modal Pembayaran menyediakan
pilihan **Prioritas Harga** yang berlaku sekali untuk seluruh transaksi. Kasir
dapat tetap memakai default Harga Khusus atau mengutamakan Harga Agen/Dinas.

## Urutan Harga

### Harga Khusus (Default)

1. Harga Khusus transaksi/manual.
2. Matching Harga Khusus otomatis.
3. Harga Agen atau Harga Dinas.
4. Harga Normal.

### Harga Agen/Dinas

1. Harga Khusus transaksi/manual.
2. Harga Agen atau Harga Dinas.
3. Matching Harga Khusus otomatis.
4. Harga Normal.

Jika produk tidak memiliki Harga Agen/Dinas yang valid, matching Harga Khusus
tetap menjadi fallback. Rule `ALL` dan rule spesifik berdasarkan tipe
pelanggan, kategori, unit, serta merek mengikuti matching specificity existing.

## Perubahan Teknis

- Shared pricing helper menerima `PricingPreference` bernilai `"SPECIAL"` atau
  `"MEMBER"`.
- Caller lama otomatis memakai `"SPECIAL"`.
- `PaymentModal` menampilkan selector hanya untuk pelanggan `AGEN` atau
  `PEMERINTAH`.
- Preference kembali ke Harga Khusus ketika pelanggan berubah atau modal
  Pembayaran dibuka ulang.
- Preview harga dan subtotal langsung mengikuti pilihan kasir.
- API transaksi menghitung ulang harga dari product master dan rule aktif,
  sehingga nominal browser bukan sumber kebenaran.
- Draft yang dibuat dari modal Pembayaran membawa preference dan pricing
  metadata yang sama.
- Nota Penawaran tanpa preference tetap mempertahankan custom quote price dan
  audit existing.
- Offline queue menyimpan preference. Saat sinkronisasi, server menghitung
  ulang harga dan memakai mekanisme approval existing jika total berubah.
- Item transaksi menyimpan sumber harga final melalui metadata rule existing;
  tidak diperlukan migrasi database.

## Dokumentasi Pengguna

Konten Bantuan, FAQ AI Assistant, dan workflow **Harga Khusus** sudah
diselaraskan dengan prioritas baru serta pilihan kasir di modal Pembayaran.

## Pengujian

TDD dijalankan per lapisan:

- Domain pricing: Harga Khusus default, Harga Agen/Dinas pilihan kasir, rule
  `ALL`, dan fallback.
- Checkout client: selector, reducer reset, pricing helper, dan manual
  transaction price.
- API transaksi online: default, explicit `"SPECIAL"`, explicit `"MEMBER"`,
  serta server-side recomputation.
- Draft: automatic pricing, transaction override, dan backward compatibility
  Nota Penawaran.
- Offline sync: kedua preference, pricing metadata, total drift, batch
  behavior, dan preservation transaction price saat stok disesuaikan.

Hasil validasi final:

- Focused pricing/checkout/API suite: 8 test files dan 71 tests lulus.
- Bantuan dan AI workflow catalog: 2 test files dan 28 tests lulus.
- Direct TypeScript `tsc --noEmit`: lulus.
- ESLint untuk seluruh file TypeScript/TSX yang disentuh: lulus.
- `git diff --check`: lulus.

Root `pnpm lint` tidak menjadi final validator karena konfigurasi Turbo repo
membuat task tersebut bergantung pada production build. Percobaan awal di
isolated worktree memicu dependency build dan berhenti pada sandbox
`spawn EPERM`; `.next` workspace utama dan development server user tidak
tersentuh. Production build tidak dijalankan ulang dan development server tidak
dijalankan atau dihentikan selama sesi agent.
