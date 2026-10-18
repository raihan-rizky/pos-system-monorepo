# Pengujian dan migrasi production pajak nota

## Cakupan

Fitur pajak nota biasa dan PPN penawaran diuji melalui helper, endpoint, state transaksi, tampilan cetak, PDF, browser, dan database. Tarif tersimpan memengaruhi total dan piutang. Metode DPP penawaran dipertahankan ketika transaksi disetujui.

## Matriks pengujian

| Kelompok | Kasus yang diperiksa | Berkas utama |
| --- | --- | --- |
| Core | Pajak dari jumlah setelah diskon, DPP 11/12 tanpa pembulatan awal, tarif dua desimal, pembulatan setengah rupiah | `tax-calculation.test.ts` |
| Kasus batas | Nol, 100%, 0,01%, 99,99%, nilai besar, pecahan rupiah, diskon penuh, nilai tidak hingga | `tax-core-edge-cases.test.ts` |
| Penggunaan | Draft menjadi transaksi final, metode pajak lama, DP, Tempo, pembayaran persis lunas, perubahan pajak dan kembalian | `tax-core-edge-cases.test.ts`, tes approval |
| API | Autentikasi, izin baca/edit, lingkup toko, JSON rusak, validasi tarif, snapshot basi, status batal/refund | `route.test.ts`, `route.state.test.ts` |
| Atomisitas | Konflik transaksi/pelanggan, perubahan status/pelanggan bersamaan, rollback saldo, kenaikan/penurunan piutang | `route.state.test.ts` |
| Nota/PDF | Persentase pada nota biasa, nominal DPP/PPN penawaran, diskon/desimal/nol, terbilang total akhir | `tax-receipts.test.tsx` |
| Smoke browser | Buka/cetak/simpan, klik ganda, retry, ganti transaksi, validasi input, izin baca, kontrol tersembunyi ketika cetak, tampilan ponsel | `tax-browser.test.mjs` |
| Regresi nomor | Nomor otomatis/kustom, cetak ulang, konflik nomor, izin Sales | `draft-receipt-number-browser.test.mjs` |
| Laporan | Pembayaran awal dan pelunasan pada hari berbeda, tidak menghitung penerimaan dua kali, pengembalian setelah pajak turun | `report-core.test.ts` |
| Database | Kolom/constraint/checksum migrasi, data lama, nilai default, penolakan tarif/metode tidak valid | `tax-database-smoke.mjs` |

## Menjalankan ulang

Jalankan dari root repository tanpa memulai atau menghentikan server aplikasi.

```powershell
pnpm --filter @pos/web exec vitest run features/transaction-tax app/api/transactions/[id]/tax/__tests__ --reporter=dot
node apps/web/features/transaction-tax/__tests__/tax-browser.test.mjs
node apps/web/features/transactions-draft/__tests__/draft-receipt-number-browser.test.mjs
node apps/web/features/transaction-tax/__tests__/tax-database-smoke.mjs --environment development
node apps/web/features/transaction-tax/__tests__/tax-database-smoke.mjs --environment production
pnpm --filter @pos/web exec tsc --noEmit
pnpm --filter @pos/db exec tsc --noEmit
```

Smoke database production selalu memakai transaksi **read-only**. Latihan migrasi hanya berjalan di development pada tabel sementara `pg_temp.pos_transactions`; tabel aplikasi tidak ditulis. Pemeriksaan database membutuhkan file konfigurasi lokal dan akses database yang sesuai. Jangan menaruh kredensial dalam laporan tes.

## Temuan dan perbaikan

1. Penawaran lama tanpa `taxRate` harus menyimpan metode DPP saat disetujui. Tarif lama tetap nullable agar nominal historis tidak dihitung ulang tanpa perubahan tarif oleh pengguna.
2. Penerimaan awal dan pelunasan dialokasikan sebagai dua kelompok terpisah dari ledger lengkap sebelum disaring berdasarkan tanggal. Kembalian lama tetap mengurangi pembayaran awal, bukan pembayaran tunai yang baru masuk pada hari pelunasan. Ini mencegah penghitungan ganda setelah pajak ditambah dan menjaga penerimaan bersih ketika pajak diturunkan.

Kedua temuan direproduksi dengan tes gagal sebelum kode diperbaiki, mengikuti `superpowers:test-driven-development` dan `superpowers:systematic-debugging`.

## Migrasi production

Migrasi target: `20261018120000_transaction_tax_rate`.

- Pemeriksaan awal: konfigurasi production cocok dengan aplikasi dan berbeda dari development.
- Hanya migrasi pajak yang tertunda; tidak ada migrasi gagal.
- Smoke production sebelum migrasi gagal pada kolom `taxRate` yang belum tersedia, sesuai kondisi awal.
- Migrasi berhasil diterapkan ke production pada 18 Oktober 2026 melalui Prisma migrate deploy.
- Smoke production setelah migrasi: 1/1 lulus; kolom, constraint, checksum migrasi, dan data pajak valid.
- Verifikasi gabungan akhir: 36 file / 412 tes lulus. Pemeriksaan TypeScript web/database, ESLint pada berkas staged, serta diff check lulus.
- Smoke Chrome pajak dan regresi nomor penawaran lulus. Smoke database development dan latihan migrasi tabel sementara: 2/2 lulus.

## Batas verifikasi dan catatan lingkungan

- Tes state API memakai pengganti batas Prisma yang mempertahankan predicate dan rollback; penjadwalan lock PostgreSQL tidak disimulasikan.
- Smoke Chrome memakai komponen aplikasi dan fixture API, bukan endpoint production yang sudah dideploy.
- Drive D tidak tersedia; dokumentasi disimpan di `markdown-files` pada checkout aktif C.
- Headroom dipanggil pada awal/akhir dan saat keluaran besar, tetapi proxy kompresinya tidak terhubung.
- GitNexus menggunakan indeks lama. Analisis dampak dijalankan pada simbol yang tersedia dan cakupan staged diperiksa sebelum commit.
