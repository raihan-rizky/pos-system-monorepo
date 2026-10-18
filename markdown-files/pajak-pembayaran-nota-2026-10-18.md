# Pajak pada pembayaran dan bagian atas nota

## Perubahan alur

- Nota biasa memiliki input **Pajak (%)** pada modal Pembayaran, setelah Diskon dan sebelum Total.
- Tarif menerima 0–100 dengan maksimal dua angka desimal. Input kosong atau tidak valid mencegah konfirmasi pembayaran. Tarif awal 0 dan kembali ke 0 ketika modal ditutup.
- Total, Uang Pas, kembalian, DP, dan Tempo memakai nilai setelah pajak. Backend menghitung nominal pajak dari harga server setelah diskon, lalu menyimpan `taxRate`, `taxMethod: STANDARD`, dan nominal pajak secara atomik bersama transaksi serta saldo pelanggan.
- Persentase Pajak dipindahkan dari ringkasan bawah ke area informasi atas nota biasa dan PDF, di dekat Tanggal dan Pembayaran. Grand Total tetap memuat pajak.
- Antrean offline membawa tarif pajak dan total akhir. Sinkronisasi menghitung ulang pajak bila jumlah barang berubah; antrean lama tanpa tarif tetap memakai 0%.
- Faktur sementara tetap menerima PPN melalui Cetak Nota Penawaran. Tarif Pajak pada modal Pembayaran berlaku untuk nota biasa dan tidak diteruskan ke pembuatan draft.

## Contoh

Subtotal Rp100.000, diskon Rp10.000, pajak 12,5% menghasilkan pajak Rp11.250 dan total Rp101.250. Tombol Uang Pas mengisi Rp101.250. Tarif disimpan saat pembayaran sehingga dapat dicetak ulang sebagai 12,5% di bagian atas nota.

## Verifikasi

Tes ditulis dan diverifikasi gagal sebelum implementasi untuk field pembayaran, tarif tersimpan, validasi, tagihan setelah pajak, posisi pajak nota, dan sinkronisasi offline. Uji urutan PDF juga diverifikasi gagal ketika template lama dipulihkan sementara, lalu template baru dikembalikan.

Perintah pemeriksaan:

```powershell
pnpm --filter @pos/web exec vitest run features/pos-checkout features/transaction-tax features/invoice-pdf app/api/transactions/__tests__/create-route.test.ts app/api/offline-sync/transactions/__tests__/route.test.ts lib/offline/__tests__ features/changelog/__tests__ features/help-documentation/__tests__ features/ai-assistant/workflows/__tests__ --reporter=dot
node apps/web/features/transaction-tax/__tests__/payment-tax-browser.test.mjs
node apps/web/features/transaction-tax/__tests__/tax-browser.test.mjs
pnpm --filter @pos/web exec tsc --noEmit
```

Uji browser menggunakan komponen asli, CSS aplikasi, dan data contoh; mencakup diskon, desimal, batas 100%, validasi, pengiriman tarif, pemisahan draft, reset tarif, fokus keyboard, dan layar ponsel. Screenshot Catatan Perubahan dipotong hanya pada field Pajak agar tidak memuat data pelanggan atau ringkasan keuangan.

## Catatan lingkungan

- Headroom MCP tidak tersedia pada sesi ini; keluaran pemeriksaan dibatasi.
- Drive D tidak tersedia. Dokumentasi disimpan di `markdown-files` pada checkout aktif `C:\Projects\pos-system-monorepo`.
- Indeks GitNexus memiliki pencarian FTS terbatas. Analisis dampak mencatat risiko tinggi pada ReceiptModal (4 pemanggil langsung, 9 simbol terdampak pada Components/History/Inventory); alur pembayaran, endpoint, PDF, dan sinkronisasi offline memiliki risiko rendah. CHANGELOG belum ditemukan di indeks.
- Perubahan memakai kolom pajak yang sudah tersedia; tidak membutuhkan migrasi schema baru.
- Server aplikasi tidak dimulai/dihentikan dan production build tidak dijalankan.

## Hasil verifikasi akhir

- Tes Bantuan diperbaiki agar memeriksa informasi Cloudflare R2 saat ini tanpa mewajibkan frasa migrasi lama. Kegagalan direproduksi sebelum perubahan tes.
- Regresi gabungan mencatat 338 tes lulus, tetapi worker workflow gagal dimulai. Uji ulang workflow dan Bantuan dengan pool forks: 2 berkas / 46 tes lulus tanpa error. Dengan menghapus hitungan ulang 26 tes Bantuan, total 358 tes terkait telah lulus.
- TypeScript web, ESLint berkas terkait, dan diff check lulus. Dua harness Chrome lulus untuk pembayaran dan nota/penawaran.
- Pemeriksaan akhir terarah pada pembayaran/pajak/nota/PDF/API/offline/changelog/workflow: **13 berkas / 192 tes lulus**.
