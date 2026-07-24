# Pembelian dan Penerimaan Barang

Tanggal pembaruan: 24 Juli 2026

## Ringkasan

Fitur ini memisahkan keputusan belanja, pembelian aktual, dan barang fisik yang benar-benar masuk:

1. **Daftar Belanja** mencatat kebutuhan dan estimasi biaya.
2. **Pembelian Barang** mencatat jumlah final, harga supplier terbaru, keputusan update HPP per produk, dan Pengeluaran kategori Bahan.
3. **Penerimaan Barang** mencatat qty fisik yang datang. Hanya finalisasi penerimaan yang sudah disetujui seluruh item yang mengubah stok.

Analoginya seperti pesan 50 dus tetapi truk baru membawa 40 dus: Pembelian Barang tetap mencatat pesanan 50 dus, penerimaan pertama mencatat 40 dus, dan penerimaan berikutnya hanya boleh mengambil sisa 10 dus.

## Model data dan migrasi

Migrasi utama:

- `packages/db/prisma/migrations/20260724_add_goods_purchases/migration.sql`
- `packages/db/prisma/migrations/20260724_goods_purchase_inbound_receipts/migration.sql`

Model penting:

- `GoodsPurchase`: dokumen pembelian terpisah yang terhubung ke satu Daftar Belanja, supplier, Pengeluaran, dan banyak Penerimaan Barang.
- `GoodsPurchaseItem`: snapshot produk, unit dan multiplier, qty, HPP master, harga terbaru, pilihan update HPP, total baris, serta status review.
- `InventoryInboundReceipt`: terhubung ke `goodsPurchaseId`, supplier, submitter/approver, dan satu `stockBundleId` setelah final.
- `InventoryInboundReceiptLine`: terhubung ke `goodsPurchaseItemId`, menyimpan expected/received quantity, match status, review status, snapshot produk/harga, catatan, dan Inventory Log canonical.

Status Pembelian Barang tetap `PENDING`, `APPROVED`, atau `REJECTED`. Fulfillment fisiknya dipisah menjadi:

- `NOT_RECEIVED`
- `PARTIALLY_RECEIVED` — ditampilkan sebagai **BARANG DITERIMA SEBAGIAN**
- `RECEIVED` — ditampilkan sebagai **BARANG DITERIMA**

Constraint utama mencegah dua item produk yang sama dalam satu pembelian dan dua line untuk item pembelian yang sama dalam satu penerimaan. Store scope tetap diterapkan pada pembacaan dan mutasi.

## Formula kuantitas

Untuk setiap item Pembelian Barang:

```text
ordered           = quantity pada GoodsPurchaseItem
approvedReceived  = total qty dari Penerimaan Barang APPROVED
pendingReserved   = total qty dari penerimaan lain yang masih SUBMITTED/PENDING
available         = max(0, ordered - approvedReceived - pendingReserved)
remaining         = max(0, ordered - approvedReceived)
```

Form pembuatan memakai `available`, sehingga beberapa draft pending boleh dibuat tetapi user mendapat informasi qty yang sudah dicadangkan penerimaan lain. Server tetap mengecek konflik saat submit dan finalisasi. Qty final tidak boleh membuat:

```text
approvedReceivedExcludingCurrent + currentReceiptQuantity > ordered
```

Catatan produk wajib bila qty diterima berbeda dari qty yang tersedia untuk penerimaan tersebut. Badge **Sesuai/Tidak Sesuai** menjelaskan kesesuaian operasional, bukan memaksa supplier selalu mengirim seluruh pesanan sekaligus; approver dapat mengubah badge saat 40 dari 50 memang sesuai ketersediaan supplier.

## Alur Pembelian Barang

1. User membuka **Supplier > Pembelian Barang > Buat Pembelian Barang**.
2. User wajib memilih Daftar Belanja yang sudah disetujui.
3. Qty default mengikuti jumlah yang di-ACC; harga default mengikuti HPP master.
4. Jika harga berbeda, keputusan update HPP dibuat per produk.
5. Dokumen diajukan sebagai PENDING dan belum mengubah stok.
6. Approver memutuskan per produk: setujui, edit, hapus, atau tambah item unit besar dari master produk.
7. Semua perubahan tersimpan langsung. Edit produk yang sudah disetujui mengembalikannya ke **Belum Ada Aksi** setelah konfirmasi.
8. Setelah semua item disetujui, dokumen otomatis APPROVED, pilihan HPP diterapkan, dan satu Pengeluaran kategori Bahan dibuat.
9. Penolakan berlaku untuk seluruh dokumen, wajib alasan, dan Daftar Belanja dapat dipilih lagi.

Approval Daftar Belanja maupun Pembelian Barang tidak mengubah stok.

## Alur Penerimaan Barang

Penerimaan dapat dibuka dari:

- **Inventaris > Transaksi > Penerimaan Barang**, lalu memilih PB;
- quick action **Barang Sudah Diterima?** pada Pembelian Barang APPROVED atau BARANG DITERIMA SEBAGIAN. Modal yang sama dibuka dengan PB tersebut sudah terpilih.

Setiap line wajib memiliki qty dan status **Sesuai** atau **Tidak Sesuai**. Catatan wajib untuk selisih qty. Setelah diajukan, penerimaan masuk riwayat sebagai PENDING.

Approver dapat:

- menyetujui produk;
- mengubah status Sesuai/Tidak Sesuai;
- mengedit qty dan catatan;
- menghapus produk;
- menolak seluruh dokumen dengan alasan wajib.

Dokumen tetap PENDING selama ada produk **Belum Ada Aksi**. Setelah item terakhir disetujui, modal tertutup otomatis, notifikasi sukses ditampilkan, dan finalisasi stok berjalan dalam transaksi yang sama.

## Atomic finalization dan stock lock

Finalizer:

1. lock Penerimaan Barang SUBMITTED;
2. memastikan semua line APPROVED dan belum memiliki bundle;
3. lock Pembelian Barang terkait;
4. hitung ulang approved received untuk menolak over-receipt;
5. lock stock group dalam urutan ID stabil untuk mengurangi risiko deadlock;
6. validasi produk aktif, store scope, membership grup, dan multiplier;
7. increment stok standalone atau `baseStock` grup;
8. buat Inventory Log canonical dan satu Batch Operation `INBOUND_RECEIPT`;
9. mark receipt APPROVED serta update fulfillment Pembelian Barang.

Jika receipt, purchase, product, multiplier, atau stok berubah di tengah proses, transaksi gagal dengan conflict dan tidak meninggalkan mutasi sebagian.

## Mode stok bersama dan Stock Log bundle

Untuk produk tanpa grup, stok produk bertambah langsung sebesar qty diterima.

Untuk mode **stok bersama**:

```text
baseDelta = receivedQuantity × unitMultiplierToBase
afterBaseStock = beforeBaseStock + baseDelta
variantDisplayStock = afterBaseStock ÷ variantMultiplier
```

Semua varian pada grup yang sama dihitung ulang dari `baseStock`. Impact canonical dan variant disimpan dalam satu bundle `INBOUND_RECEIPT`, jadi Log Stok bisa dibuka sebagai satu kejadian operasional, bukan serpihan log yang kehilangan konteks.

Daftar Log Stok menampilkan nama supplier, misalnya **CV Sumber Rezeki**. Nomor **PB-...** hanya ditampilkan di detail modal bundle bersama before/after/delta untuk canonical dan variannya.

## Status dan navigasi Supplier

- PB tanpa penerimaan approved: status fulfillment belum ditampilkan.
- Ada qty approved tetapi belum lengkap: **BARANG DITERIMA SEBAGIAN**.
- Seluruh item sudah terpenuhi: **BARANG DITERIMA**.
- Klik baris partial/full membuka perbandingan **Dipesan / Diterima / Pending / Sisa** serta batch penerimaannya.
- Quick action **Lihat Riwayat Penerimaan Barang** membuka `/inventory?tab=transactions&subtab=inbound&goodsPurchaseId=...`.

## API utama

Pembelian Barang:

- `GET/POST /api/suppliers/goods-purchases`
- `GET /api/suppliers/goods-purchases/eligible-shopping-requests`
- `GET /api/suppliers/goods-purchases/large-unit-products`
- `GET /api/suppliers/goods-purchases/:id`
- `POST /api/suppliers/goods-purchases/:id/decision`
- `POST /api/suppliers/goods-purchases/:id/reject`
- `POST /api/suppliers/goods-purchases/:id/items`
- `PATCH/DELETE /api/suppliers/goods-purchases/:id/items/:itemId`
- `POST /api/suppliers/goods-purchases/:id/items/:itemId/approval`
- `GET /api/suppliers/goods-purchases/:id/receiving-comparison`

Penerimaan Barang:

- `GET/POST /api/inventory-management/inbound-receipts`
- `GET/PATCH /api/inventory-management/inbound-receipts/:id`
- `POST /api/inventory-management/inbound-receipts/:id/submit`
- `POST /api/inventory-management/inbound-receipts/:id/reject`
- `PATCH/DELETE /api/inventory-management/inbound-receipts/:id/items/:itemId`
- `POST /api/inventory-management/inbound-receipts/:id/items/:itemId/approval`
- `GET /api/inventory-management/receiving-queue`
- `GET /api/inventory/bulk/:batchId` untuk detail bundle, termasuk `INBOUND_RECEIPT`

History dan receiving queue menerima filter `goodsPurchaseId`.

## RBAC

Default approval/rejection hanya untuk OWNER dan dapat didelegasikan:

- `supplier.goods_purchase.approve:update`
- `supplier.goods_purchase.reject:update`
- `inventory.inbound_receipt.approve:update`
- `inventory.inbound_receipt.reject:update`
- `inventory.inbound_receipt.edit:update`

UI flow baru tidak menyediakan **Minta Revisi**. Schema dan endpoint legacy `needs-revision` tetap dipertahankan untuk kompatibilitas data lama, tetapi tidak menjadi aksi pada approval modal baru dan tidak punya permission RBAC baru.

## Cache dan refresh UI

Setelah penerimaan berubah, invalidasi mencakup:

- `goods-purchases`
- `inventory-management`
- `inventory-logs`

Ini menjaga status PB, riwayat penerimaan, dan Stock Log bundle tetap sinkron setelah approval.

## Verifikasi

Validasi yang dipakai selama implementasi:

- targeted Vitest untuk helper quantity, service/finalizer, API, modal, Supplier integration, Stock Log, Help, workflow catalog, dan RBAC;
- targeted ESLint pada file yang berubah;
- TypeScript `tsc --noEmit`;
- Prisma schema validation;
- `git diff --check`.

Test concurrency mencakup mock transaction/locking, stable stock-group lock order, conflict retry, idempotency bundle, dan pencegahan over-receipt. Belum ada live PostgreSQL/Testcontainers harness di workspace ini, jadi perilaku lock database nyata tetap perlu smoke test di environment integrasi sebelum production rollout.

Perintah `pnpm build` tidak dijalankan selama sesi agent agar aset `.next` development dan HMR milik user tidak terganggu.
