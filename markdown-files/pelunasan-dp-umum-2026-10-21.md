# Pelunasan DP pelanggan Umum

Tanggal: 2026-10-21 (Asia/Jakarta).

## Masalah dan akar penyebab

Invoice DP dapat dibuat dengan `customerId: null`, tetapi endpoint pelunasan
sebelumnya mewajibkan pelanggan dan relasi `DebtPaymentLog.customerId` wajib terisi.
Akibatnya pembayaran invoice Umum ditolak dengan HTTP 422 dan pesan
"Customer wajib dipilih untuk mencatat pembayaran piutang".

## Perubahan

- Pelunasan dan cicilan tetap melekat pada invoice tanpa membuat pelanggan baru.
- `DebtPaymentLog.customerId` dan relasi pelanggan menjadi opsional; relasi invoice
  dan toko tetap wajib. Riwayat lama tetap dipertahankan.
- Saldo pelanggan hanya diperbarui bila invoice terhubung ke pelanggan.
- Setiap metode pembayaran tetap dicatat untuk riwayat piutang dan laporan keuangan.
- Pembaruan invoice memeriksa nilai pembayaran, status, total, dan pelanggan agar
  pembayaran bersamaan tidak menghasilkan pencatatan ganda atau salah pelanggan.
- Tipe data rekap menerima log pembayaran tanpa pelanggan.

## Cara penggunaan

1. Buka Pelanggan > Piutang dan cari invoice DP Umum.
2. Klik Bayar Piutang, isi metode dan nominal maksimal sisa tagihan.
3. Klik Proses Pembayaran. Setelah lunas, invoice tetap tersedia pada filter Lunas.

## Penerapan database

Migrasi: `20261021090000_allow_general_debt_payments`.
Migrasi hanya menghapus batasan NOT NULL pada `pos_debt_payment_logs.customerId`.
Terapkan migrasi sebelum memakai endpoint baru dan generate ulang Prisma Client.
Tidak ada penghapusan atau pemindahan data pelanggan.

## Verifikasi

- Tes regresi cicilan dan pelunasan Umum terbukti gagal dengan HTTP 422 sebelum perbaikan.
- Endpoint diuji untuk cicilan, pelunasan, metode gabungan, catatan pembayaran,
  perubahan pelanggan bersamaan, serta konflik pembaruan invoice.
- Regresi piutang, rekap pelanggan, ekspor, dan laporan keuangan: 200 tes lulus.
- Catatan perubahan, Bantuan, dan katalog workflow: 16 tes lulus.
- TypeScript web dan database lulus melalui `pnpm --filter @pos/web exec tsc --noEmit`
  dan `pnpm --filter @pos/db exec tsc --noEmit`. Perintah root `pnpm type-check`
  dihentikan karena memicu dependency build melalui Turbo.
- Prisma Client berhasil digenerate dan `prisma validate` lulus.
- Migrasi berhasil diterapkan pada database development dan production pada 2026-10-21.
- Review independen tidak menemukan masalah pada cakupan perubahan.
- Headroom stats dipanggil pada awal/akhir sesi. Proxy Headroom tidak tersedia;
  kompresi kode privat sebelumnya ditolak oleh pemeriksaan otomatis, sehingga
  pemeriksaan kode dan output dilakukan secara lokal dengan keluaran terbatas.

Dokumen disimpan pada `markdown-files` di checkout aktif
`C:\Projects\pos-system-monorepo`; lokasi lama `D:\main_project\pos-system-monorepo`
tidak tersedia pada lingkungan ini.
