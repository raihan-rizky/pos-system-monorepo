# Product Import Review Fixes - 2026-07-02

## Ringkasan

Perbaikan ini menutup beberapa masalah pada alur import produk dan supplier:

- Worker import produk kembali membaca `PRODUCT_IMPORT_WORKER_STORE_ID`, sehingga job dari store selain `store-main` tidak tertahan.
- Import supplier sekarang mencocokkan supplier lama berdasarkan kode supplier, bukan hanya nama.
- Import produk tidak menghapus relasi supplier ketika kode supplier pada file tidak ditemukan.
- Snapshot batch import produk sekarang dapat menyimpan `supplierIds`, dan Undo memulihkan relasi supplier ketika snapshot mencatatnya.
- Validasi chunk import produk menerima ukuran default 500 untuk start dan chunk.
- Full update import produk mempertahankan Harga Agen lama saat file tidak memberikan nilai Harga Agen yang valid.

## Catatan Perilaku

- Kode supplier yang tidak ditemukan tetap diabaikan seperti pesan preview, tanpa menghapus supplier yang sudah terhubung ke produk.
- Harga Agen hanya diganti jika baris import memberi nilai numerik. Kolom kosong atau tidak ada tidak menghapus harga agen lama.
- Snapshot lama yang belum memiliki `supplierIds` tetap kompatibel dengan Undo lama.

## Verifikasi

- `pnpm --filter @pos/web test features/product-import/services/__tests__/product-import-worker-runtime.test.ts features/supplier-import/services/__tests__/supplier-import-service.test.ts features/product-import/services/__tests__/product-import-commit-service.test.ts features/product-import/helpers/__tests__/import-core.test.ts features/batch-operations/helpers/__tests__/snapshots.test.ts app/api/products/import/commit/chunk/__tests__/route.test.ts app/api/batch-operations/[id]/undo/__tests__/route.test.ts`
- `pnpm --filter @pos/web test features/product-import/helpers/__tests__/auto-decisions.test.ts features/supplier-import/helpers/__tests__/import-core.test.ts`
- `pnpm --filter @pos/web type-check`
- `pnpm --filter @pos/product-import-worker type-check`
