# Rencana implementasi pembayaran giro dan laporan bulanan

> **Untuk pelaksana:** gunakan `superpowers:executing-plans` untuk menjalankan
> langkah secara berurutan. Setiap perubahan perilaku dimulai dengan pemeriksaan
> yang gagal dan dilanjutkan dengan pemeriksaan yang sama setelah implementasi.

**Tujuan:** mencatat pelunasan giro, memisahkan pengeluaran manual dari belanja,
dan menghasilkan saldo hutang serta rekap kas berdasarkan tanggal pembayaran.

**Arsitektur:** satu hutang pemasok opsional terhubung ke satu pembelian giro;
riwayat pembayaran hutang menjadi sumber pembayaran giro. Pembelian lama tanpa
hubungan yang diverifikasi ditandai belum diketahui. Pembuat laporan memisahkan
pengeluaran manual, jadwal belanja, pembayaran aktual, dan saldo hutang sebelum
menyusun Excel dan ringkasan kas Keuangan.

**Teknologi:** Next.js, TypeScript, Prisma/PostgreSQL, Vitest, xlsx-js-style.

**Spesifikasi:** `markdown-files/laporan-keuangan-giro-design-2026-11-01.md`.

## Batasan global

- Analisis dampak GitNexus wajib sebelum mengubah setiap simbol; laporkan
  pemanggil langsung, alur terkait, dan tingkat risiko sebelum mengedit.
- Nominal dihitung dalam sen bilangan bulat; tanggal kalender dan batas periode
  menggunakan WIB. Jangan membuat pembayaran historis secara otomatis.
- Nominal terjadwal di sheet belanja tidak digunakan sebagai pembayaran kas.
- Giro lama yang belum diperiksa menyebabkan hasil terkait berstatus belum
  tersedia atau belum lengkap, bukan nol.
- Jangan menjalankan `pnpm build` atau mengelola proses server pengembangan.

## Tugas 1 — Hubungan database dan giro baru

**Berkas:** `packages/db/prisma/schema.prisma`, migrasi baru
`packages/db/prisma/migrations/20261101110000_link_giro_payables/migration.sql`,
`apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts`,
dan `apps/web/features/inventory-management/repositories/__tests__/inbound-purchase-payment.test.ts`.

- [ ] Tambahkan pemeriksaan bahwa penerimaan pertama giro membuat tepat satu
  hutang terhubung yang riwayatnya diketahui, penerimaan berikutnya tidak
  menggandakan hutang, dan transfer tidak membuat hutang giro. Pertahankan
  pemeriksaan expense lama. Contoh ekspektasi transaksi tiruan:

  ```ts
  expect(tx.supplierPayable.create).toHaveBeenCalledTimes(1);
  expect(tx.supplierPayable.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ goodsPurchaseId: "purchase-1", storeId: "store-1" }),
  }));
  ```

- [ ] Jalankan berkas pemeriksaan tersebut dan pastikan kasus baru gagal karena
  hubungan giro belum dibuat.
- [ ] Tambahkan `goodsPurchaseId String? @unique`, hubungan opsional ke
  `GoodsPurchase`, dan `giroHistoryVerifiedAt DateTime?` pada `SupplierPayable`;
  tambahkan hubungan balik pada `GoodsPurchase`. Migrasi menambahkan kolom,
  unique index, dan foreign key tanpa membuat pembayaran atau hutang historis.
- [ ] Dalam transaksi penerimaan, buat hutang terhubung dengan total, pemasok,
  tanggal, jatuh tempo, dan status riwayat diketahui hanya untuk giro baru.
  Hormati expense lama dan kunci pembelian yang sudah ada.
- [ ] Jalankan `pnpm db:generate`, pemeriksaan penerimaan di atas, dan
  pemeriksaan migrasi PostgreSQL terisolasi untuk data lama, unique link, dan
  foreign key. Jangan menerapkan migrasi ke database yang berisi data pengguna
  selama pemeriksaan terisolasi.

## Tugas 2 — Peninjauan giro lama dan pembayaran

**Berkas:** `apps/web/app/api/finance/giro/route.ts`,
`apps/web/app/api/finance/giro/[goodsPurchaseId]/reconcile/route.ts`,
`apps/web/app/api/finance/supplier-payables/[id]/payments/route.ts`,
helper baru di `apps/web/features/keuangan/`, dan pemeriksaan endpoint terkait.

- [ ] Tambahkan pemeriksaan daftar giro toko, status belum diketahui untuk
  pembelian lama tanpa riwayat, konfirmasi pembayaran historis bertanggal,
  penghubungan hutang manual, serta penolakan tautan lintas toko atau nominal
  yang tidak cocok. Pemeriksaan juga harus menolak duplikasi hubungan dan
  pembayaran yang melebihi saldo.
- [ ] Pastikan pemeriksaan gagal sebelum implementasi. Gunakan `expense:read`
  untuk daftar dan `expense:update` untuk peninjauan serta pembayaran.
- [ ] Daftarkan giro dari pembelian dan expense yang sah. Bedakan catatan baru
  yang diketahui dari pembelian lama yang belum terhubung. Jangan mencocokkan
  hutang manual otomatis; tautan memerlukan pilihan dan konfirmasi pengguna.
- [ ] Terapkan peninjauan dalam transaksi yang mengunci pembelian dan hutang,
  memverifikasi toko, nominal, tanggal, serta jumlah pembayaran. Simpan tanggal
  pembayaran sebenarnya dan tandai riwayat diketahui hanya setelah konfirmasi
  eksplisit bahwa riwayat sudah lengkap.
- [ ] Gunakan endpoint pembayaran yang sudah ada untuk catatan terhubung yang
  riwayatnya diketahui. Kunci baris hutang, cek total dalam sen, tolak tanggal
  mendatang atau sebelum kewajiban, dan hitung ulang sisa dalam transaksi.
- [ ] Jalankan `pnpm --filter @pos/web exec vitest run
  app/api/finance/supplier-payables/__tests__/routes.test.ts` serta berkas tes
  giro baru. Sertakan dua pembayaran bersamaan pada PostgreSQL terisolasi dan
  pastikan total keduanya tidak dapat melampaui nominal hutang.

## Tugas 3 — Antarmuka giro di Keuangan

**Berkas:** `apps/web/features/keuangan/components/SupplierPayablesPanel.tsx`,
komponen dan helper giro baru di folder yang sama, halaman Keuangan, dan tes UI.

- [ ] Tambahkan pemeriksaan tampilan **Belum diketahui**, **Belum lunas**,
  **Sebagian**, **Lunas**, nominal sisa, tanggal jatuh tempo, tombol **Catat
  pembayaran**, dan peninjauan riwayat. Pastikan peran tanpa izin memperbarui
  tidak memperoleh tombol mutasi.
- [ ] Tampilkan daftar giro dengan nomor pembelian dan pemasok; izinkan memilih
  hutang manual yang benar, memasukkan pembayaran historis bertanggal, dan
  mengonfirmasi kelengkapan. Tampilkan kesalahan yang dapat ditindaklanjuti bila
  nominal tidak cocok atau riwayat belum lengkap.
- [ ] Untuk giro yang riwayatnya diketahui, pakai alur pembayaran sebagian atau
  penuh yang sudah ada. Jangan membuat expense manual kedua. Segarkan daftar,
  saldo, dan ringkasan kas setelah mutasi berhasil.
- [ ] Jalankan pemeriksaan komponen dan endpoint yang relevan; periksa label,
  navigasi papan ketik, status memuat/gagal, dan tampilan layar kecil.

## Tugas 4 — Sumber data dan perhitungan lintas bulan

**Berkas:** `apps/web/features/financial-report/services/monthly-report.ts`,
`services/monthly-balances.ts`, `helpers/monthly-report-types.ts`,
`helpers/monthly-report-core.ts`, dan tes bulanannya.

- [ ] Tambahkan kasus Oktober–Desember: giro Rp100.000 tercatat Oktober,
  jatuh tempo November, dibayar Rp30.000 November dan Rp70.000 Desember.
  Verifikasi Oktober hutang Rp100.000; November jadwal belanja Rp100.000,
  hutang Rp70.000, kas keluar Rp30.000; Desember kas keluar Rp70.000 dan
  hutang Rp0. Gunakan juga kasus belum dibayar sama sekali pada bulan jatuh
  tempo, pembayaran sebelum jatuh tempo, dan tanggal batas WIB.
- [ ] Tambahkan kasus expense manual, pembelian transfer, belanja legacy,
  hutang manual terhubung tanpa duplikasi, dan riwayat giro belum diketahui.
  Pastikan RP hanya memuat expense tanpa `goodsPurchaseId` dan tanpa
  `shoppingRequestId`; `transactionId` sendiri tidak menjadikannya otomatis.
- [ ] Pastikan tes gagal sebelum implementasi. Perluas query ke pembelian dan
  pembayaran sebelum atau di dalam periode yang diperlukan, bukan hanya
  expense dengan `occurredAt` pada bulan laporan. Semua query dibatasi toko.
- [ ] Bentuk koleksi terpisah untuk expense manual, jadwal belanja, pembayaran
  giro aktual, serta saldo hutang per akhir periode. Simpan sumber dan tanggal
  yang cukup untuk melacak setiap baris; jangan menyatukan giro dan hutang
  manual yang tidak mempunyai hubungan eksplisit.
- [ ] Propagasikan status belum lengkap untuk riwayat yang tidak diketahui dan
  kosongkan nilai total yang bergantung padanya. Hitung periode lampau dari
  tanggal pembayaran, bukan status lunas saat ini.
- [ ] Jalankan `pnpm --filter @pos/web exec vitest run
  features/financial-report/helpers/__tests__/monthly-report-core.test.ts
  features/financial-report/services/__tests__/monthly-report.test.ts` dan tes
  saldo baru.

## Tugas 5 — Workbook dan ringkasan kas

**Berkas:** `apps/web/features/financial-report/helpers/monthly-workbook.ts`,
`monthly-workbook-guide.ts`, tes workbook, endpoint
`apps/web/app/api/finance/expenses/summary/route.ts`, dan komponen ringkasan
Keuangan yang memakai hasil endpoint.

- [ ] Tambahkan pemeriksaan sel untuk contoh Rp100.000/Rp30.000/Rp70.000,
  jatuh tempo tanpa pembayaran, pembayaran sebelum dan setelah jatuh tempo,
  transfer, giro belum diketahui, dan hutang manual terhubung. Baca kembali
  hasil `serializeMonthlyWorkbook` untuk memeriksa nilai dan rumusnya.
- [ ] Bangun RP dari expense manual. Bangun sheet belanja dari jadwal transfer
  dan giro; giro memakai bulan jatuh tempo dan nilai penuh. Sediakan rincian
  pembayaran giro aktual di rekap agar perubahan kas dapat ditelusuri.
- [ ] Sesuaikan rumus harian, BERSIH, dan LAP KEU agar pembayaran aktual
  dihitung sekali, jadwal giro tidak dihitung sebagai kas, dan hasil yang belum
  diketahui tetap kosong dengan keterangan. Hindari referensi rumus melingkar.
- [ ] Ubah ringkasan kas Keuangan memakai perhitungan yang sama, termasuk status
  belum lengkap, tanpa mengubah metrik lain yang tidak terkait.
- [ ] Jalankan tes workbook, serialisasi, endpoint ringkasan, dan tampilan.

## Tugas 6 — Dokumentasi dan pemeriksaan akhir

**Berkas:** `apps/web/features/help-documentation/components/HelpContent.tsx`,
`apps/web/features/ai-assistant/workflows/workflow-catalog.ts`, dokumen bantuan
laporan/Keuangan, `apps/web/features/changelog/data/changelog.ts`, dan
`markdown-files/laporan-keuangan-giro-design-2026-11-01.md`.

- [ ] Perbarui Bantuan, alur asisten, panduan Excel, dan catatan perubahan
  berbahasa Indonesia untuk alur serta batasan yang benar-benar tersedia.
- [ ] Jalankan tes terarah seluruh area yang berubah, `pnpm type-check`, dan
  `git diff --check`; tinjau formula, status tidak diketahui, serta migrasi
  pada PostgreSQL terisolasi. Jangan menjalankan `pnpm build`.
- [ ] Jalankan `gitnexus detect-changes` dan tinjau perubahan serta alur yang
  terdampak. Laporkan pemeriksaan yang tidak dapat dilakukan dan hasil migrasi
  secara terpisah dari implementasi.
