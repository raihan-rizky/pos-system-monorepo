# Faktur Sementara Implementation Plan

> Pelaksanaan langsung pada sesi ini dengan skill executing-plans dan test-driven-development.

**Goal:** Nomor faktur sementara otomatis/manual dan tanggal serta jam WIB yang langsung terisi.

**Architecture:** Pertahankan draftNumber dan invoiceDate pada Transaction. Tambahkan pratinjau nomor melalui GET pada API draft; POST membedakan nomor manual dengan otomatis, menormalisasi format nomor, dan memakai urutan numerik terbesar ditambah satu. Gunakan kontrol nomor bersama dan hook nilai awal waktu untuk form pembayaran dan nota penawaran.

**Tech Stack:** Next.js, React, TypeScript, Prisma, Vitest.

## Constraints

- Teks pengguna berbahasa Indonesia; pertahankan RBAC tanggal invoice.
- Tidak menjalankan build atau mengubah lifecycle dev server.
- Analisis impact sebelum mengedit simbol yang ada; tidak mengubah skema database.

## 1. API nomor draft

- [x] Tambah tes POST dengan draftNumber `CUSTOM/001`, spasi kosong, lebih dari 100 karakter, dan P2002 manual yang harus menghasilkan 409 tanpa retry. Tes otomatis harus tetap retry.
- [x] Tambah tes GET untuk pratinjau nomor otomatis, validasi tanggal, dan izin create draft.
- [x] Jalankan `pnpm --filter @pos/web test app/api/transactions/draft/__tests__/route.test.ts` dan pastikan tes baru gagal karena fitur belum tersedia.
- [x] Tambah draftNumber opsional di schema dan tipe input; simpan nomor manual atau buildDraftNumber untuk otomatis; tangani P2002 manual dengan pesan Indonesia.
- [x] Tambah GET pratinjau read-only menggunakan penomoran dan izin yang sama.
- [x] Jalankan ulang tes API sampai lulus.

## 2. Form dan nilai awal

- [x] Tambah tes nilai input WIB di PaymentModal dan NotaPenawaranModal, serta kontrol No. Faktur pada kedua form.
- [x] Tambah tes hook untuk pembaruan server yang tidak menimpa edit, reset saat dibuka kembali, dan pengembalian nomor ke otomatis.
- [x] Pastikan tes gagal sebelum implementasi.
- [x] Tambah hook nilai awal tanggal/jam, kontrol No. Faktur dan pratinjau otomatis; hubungkan draftNumber dari PaymentModal melalui POSClientPage ke API.
- [x] Teruskan waktu yang dipilih Owner/Admin dari NotaPenawaranModal, serta alasan jika memilih hari lain.
- [x] Jalankan regresi API, form, invoice-date, dan nota-penawaran.

## 3. Panduan dan verifikasi akhir

- [x] Perbarui HelpContent dan workflow-catalog untuk alur membuat faktur sementara.
- [x] Jalankan tes Bantuan/katalog, tes faktur terkait, dan pemeriksaan langsung `pnpm --filter <paket> exec tsc --noEmit` (root Turbo memanggil dependency build).
- [x] Tinjau diff dan catat hasil pengujian serta keterbatasan alat di dokumentasi desain.
