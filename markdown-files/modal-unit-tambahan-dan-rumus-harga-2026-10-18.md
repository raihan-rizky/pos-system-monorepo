# Modal unit tambahan dan rumus harga berurutan

Tanggal: 2026-10-18 (WIB).

## Tambah produk baru

- Kolom utama unit tambahan menampilkan **Harga modal**, tersimpan sebagai `costPrice`.
- Modal otomatis mengikuti konversi modal unit utama: modal Rp1.000/pcs dan isi 12 pcs/dus menghasilkan Rp12.000/dus. Untuk unit lebih kecil, modal dibagi isi kemasan. Modal hasil konversi dibulatkan dua desimal.
- Modal unit tambahan dapat diubah manual, termasuk Rp0.
- **Detail tambahan** berisi SKU, barcode, dan **Harga jual**. Harga jual awal dihitung dari modal unit tambahan +35%, dibulatkan ke rupiah terdekat.
- Harga jual dapat diubah manual, termasuk Rp0. Setelah diubah manual, nilainya dipertahankan ketika modal atau konversi berubah.
- Jika modal belum tersedia, masukkan modal unit utama atau modal unit tambahan untuk memperoleh saran harga jual. Harga jual juga dapat diisi manual melalui Detail tambahan.

## Harga Khusus

Cara hitung baru: **Modal unit + persen − persen**.

`harga = modal unit dipilih × (1 + tambahan/100) × (1 − potongan/100)`

Contoh: modal Rp12.000/dus, tambahan 10%, potongan 5% menghasilkan Rp12.540/dus. Potongan kedua menggunakan hasil setelah tambahan. Pengguna mengisi kedua persentase secara terpisah; potongan harus berada pada 0–100%. Pembulatan harga dua desimal dilakukan setelah kedua langkah.

Rumus baru memakai modal produk dengan satuan yang sedang dipilih. Rumus **Modal + rupiah** dan **Modal + persen** tetap memakai sumber modal satuan terkecil. Jika modal sumber rumus tidak valid atau tidak tersedia, sistem memakai harga member yang sesuai atau harga normal.

Persentase tambahan disimpan di `value`, potongan di `discountPercent`. Snapshot transaksi menyimpan mode, tambahan, potongan (`pricingDiscountPercent`), dan harga hasil untuk transaksi biasa, draft, persetujuan, serta sinkronisasi offline.

## Migrasi dan verifikasi

- Migrasi: `packages/db/prisma/migrations/20261018093000_add_unit_cost_sequential_pricing/migration.sql`.
- Migrasi telah diterapkan ke dev dan produksi pada 2026-10-18 (WIB). Kedua database memiliki 73 migrasi lokal dengan status up to date.
- Pengujian meliputi konversi besar/kecil, modal nol, harga jual manual, pratinjau, validasi persentase, penyimpanan aturan, perhitungan checkout/server, dan snapshot transaksi.
- Bantuan, katalog workflow AI Assistant, sumber panduan AI Assistant, dan Catatan Perubahan diperbarui bersama implementasi.
- Label rumus pada dialog Pembayaran menampilkan kedua persentase sesuai aturan yang diterapkan.
- Prisma Client berhasil dibuat dan skema lolos `prisma validate`.
- Pemeriksaan TypeScript web dan ESLint file yang berubah lulus. Error pajak dari perubahan paralel pada pemeriksaan sebelumnya sudah diperbaiki di commit terpisah.
- Pengujian browser formulir produk dan rumus harga lulus, termasuk isian manual, fokus kesalahan, keyboard, tampilan ponsel, serta payload tambah/ubah aturan.
- Suite web lengkap: 484 berkas lulus, 2 berkas dilewati; 3.088 tes lulus dan 10 tes dilewati. Eksekusi menggunakan satu worker fork agar stabil pada Windows.

Dev juga menerapkan dua migrasi lama yang masih tertinggal: `20260727_transaction_search_trgm_indexes` dan `20261010_unified_shopping_request_approval`. Produksi hanya menunggu migrasi fitur harga ini. Konfigurasi produksi memakai `packages/db/env.production.env`, karena shortcut yang mengarah ke `.env.production` tidak tersedia; kredensial tidak dicetak atau dimasukkan ke commit.

Percobaan produksi pertama berhenti dengan `Schema engine error` sebelum enum, kolom, atau catatan migrasi dibuat. Status dan metadata diperiksa terlebih dahulu; percobaan ulang `prisma migrate deploy` kemudian berhasil. Verifikasi baca saja mengonfirmasi `discountPercent` sebagai Decimal(5,2) NOT NULL DEFAULT 0, `pricingDiscountPercent` sebagai Decimal(5,2) nullable, enum baru, serta catatan migrasi selesai tanpa rollback. Tidak ada reset, seed, atau `db push`.

Publikasi ditujukan ke `origin/main`, dengan snapshot 48 file fitur, tes, migrasi, gambar panduan, dan dokumentasi. Perubahan pajak paralel berada pada commit terpisah. File env dan log operasional tidak dimasukkan ke snapshot ini. Hook Git tetap aktif; development server tidak dimulai atau dihentikan dan production build tidak dijalankan.

## Matriks tes inti dan kasus batas

Tambahan verifikasi 2026-10-18: tiga berkas inti memuat 77 tes yang lulus (51 kasus tambahan pada tahap penguatan tes).

| Area | Perilaku yang diperiksa |
| --- | --- |
| Konversi modal | Unit lebih besar/kecil, pecahan dengan pembulatan dua desimal, konversi kosong/nol/negatif/tidak terbatas |
| Harga jual | Saran modal +35%, pembulatan rupiah, harga manual termasuk nol, beberapa unit dengan harga independen |
| Modal manual | Menghapus override kembali ke konversi, modal kosong dengan harga jual manual, nilai nonnumerik/tidak terbatas ditolak |
| Rumus berurutan | Penambahan lalu potongan dari hasilnya, modal satuan dipilih, modal nol, tambahan nol atau di atas 100%, potongan 0% dan 100% |
| Ketepatan harga | Pecahan persen, pembulatan akhir, kesesuaian pratinjau dengan mesin harga, overflow kembali ke harga normal |
| Cakupan dan fallback | Kategori/satuan/merek/pelanggan tidak cocok, aturan nonaktif, modal tidak tersedia memakai harga member/normal |
| Kompatibilitas | Rumus modal lama tetap memakai satuan terkecil dan mengabaikan persentase kedua |
| API tambah/ubah | Kedua persen tersimpan, edit potongan saja atau tambahan saja, ganti rumus menghapus potongan, input salah tidak disimpan |
| Metadata database | Status migrasi, enum baru, kedua kolom Decimal(5,2), catatan migrasi selesai tanpa rollback |

Catatan alat: Headroom MCP dipanggil, tetapi proxy kompresinya tidak dapat dijangkau; keluaran pemeriksaan dibatasi. Indeks GitNexus tidak memuat beberapa helper unit baru, dan pembaruan indeks gagal saat memulai native worker; pemanggil helper tersebut ditelusuri langsung.

Catatan lokasi: drive `D:` tidak tersedia pada sesi ini, sehingga dokumen disimpan pada `markdown-files` di checkout aktif `C:\Projects\pos-system-monorepo`.
