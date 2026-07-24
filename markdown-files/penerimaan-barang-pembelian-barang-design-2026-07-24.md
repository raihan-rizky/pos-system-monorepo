# Design Workflow Penerimaan Barang dari Pembelian Barang

Tanggal: 24 Juli 2026  
Status: Approved

## Ringkasan

Workflow Penerimaan Barang di Inventaris akan memakai **Pembelian Barang** yang sudah disetujui sebagai sumber, bukan Daftar Belanja. Pengguna mencatat kuantitas fisik dan kondisi kesesuaian per produk, lalu mengajukan receipt ke riwayat. Owner atau role yang diberi izin memproses produk satu per satu. Stok baru berubah secara atomik setelah semua item receipt selesai disetujui.

Pembelian Barang dapat diterima dalam beberapa batch. Sistem menghitung kuantitas yang sudah diterima, kuantitas yang sedang dicadangkan oleh receipt pending, dan sisa yang masih dapat diterima. Halaman Supplier menampilkan status fulfillment dan menyediakan akses cepat untuk membuat serta melihat riwayat penerimaan.

Analogi sederhananya: Pembelian Barang adalah purchase order, sedangkan Penerimaan Barang adalah bukti bongkar truk. Checklist dapat diproses per kardus, tetapi stok baru diposting setelah bukti penerimaan selesai diverifikasi.

## Tujuan

- Mengganti sumber Penerimaan Barang dari Daftar Belanja ke Pembelian Barang approved.
- Mendukung penerimaan bertahap sampai seluruh kuantitas pesanan terpenuhi.
- Menyediakan input kuantitas, status Sesuai/Tidak Sesuai, dan catatan per produk.
- Menyediakan review individual product dengan approve, edit, dan remove.
- Menambah stok dan inventory log tepat satu kali saat receipt final approved.
- Menampilkan fulfillment Pembelian Barang sebagai Belum Diterima, Barang Diterima Sebagian, atau Barang Diterima.
- Menyediakan perbandingan kumulatif dan breakdown setiap batch penerimaan.
- Menyediakan RBAC approve, reject, dan edit dengan default OWNER.
- Menjaga receipt lama berbasis Daftar Belanja tetap dapat dibaca.

## Non-Goals

- Tidak memigrasikan atau menebak mapping receipt legacy ke Pembelian Barang.
- Tidak menambah produk baru ke receipt saat proses approval.
- Tidak mengizinkan total kuantitas approved melampaui kuantitas Pembelian Barang.
- Tidak mengubah Expense atau HPP saat Penerimaan Barang diproses.
- Tidak mempertahankan aksi Minta Revisi untuk workflow baru.

## Pendekatan

Model `InventoryInboundReceipt` existing diperluas, bukan diganti dengan model V2. State approval pembelian, fulfillment pembelian, status dokumen receipt, status review item, dan status kesesuaian item disimpan terpisah agar setiap field memiliki satu arti.

Pendekatan ini menjaga history dan pola API existing, mengurangi duplikasi, serta mempertahankan kompatibilitas data lama.

## Data Model

### GoodsPurchase

Tambahkan `fulfillmentStatus`:

- `NOT_RECEIVED`
- `PARTIALLY_RECEIVED`
- `RECEIVED`

Field `GoodsPurchase.status` tetap memakai lifecycle approval:

- `PENDING`
- `APPROVED`
- `REJECTED`

Dengan pemisahan ini, purchase yang sah tetap berstatus `APPROVED`, sementara progress pengiriman disimpan di `fulfillmentStatus`.

### InventoryInboundReceipt

Tambahkan relasi opsional:

- `goodsPurchaseId` ke `GoodsPurchase`.

Receipt baru wajib memiliki `goodsPurchaseId`. Field `shoppingRequestId` dipertahankan hanya untuk receipt legacy.

Status dokumen tetap:

- `DRAFT` untuk kompatibilitas data lama;
- `SUBMITTED` sebagai Menunggu Persetujuan;
- `APPROVED`;
- `REJECTED`;
- `NEEDS_REVISION` dan `CANCELLED` hanya untuk kompatibilitas history lama.

Pengajuan baru dibuat dan langsung dipindahkan ke `SUBMITTED`.

### InventoryInboundReceiptLine

Tambahkan:

- `goodsPurchaseItemId` ke `GoodsPurchaseItem`;
- `matchStatus`: `MATCHED` atau `MISMATCHED`;
- `reviewStatus`: `PENDING` atau `APPROVED`;
- `approvedById`, `approvedByName`, dan `approvedAt`.

Field `expectedQuantitySnapshot` menyimpan kuantitas yang ditawarkan untuk batch saat receipt dibuat. Field ini bukan selalu total pesanan awal. Contoh: pesanan 50, sudah approved 40, maka receipt berikutnya menawarkan expected batch 10.

Field `receivedQuantity` menyimpan kuantitas fisik yang diajukan. `matchStatus` dipilih manual dan tidak diturunkan dari selisih angka.

### Constraint dan Index

- Index receipt berdasarkan `goodsPurchaseId`, status, dan waktu.
- Index line berdasarkan `goodsPurchaseItemId` dan review status.
- Satu receipt tidak boleh memiliki produk Pembelian Barang yang sama lebih dari sekali.
- Relasi source divalidasi server-side agar receipt dan purchase berasal dari store yang sama.

## Semantik Kuantitas

Per item Pembelian Barang:

```text
orderedQty = GoodsPurchaseItem.quantity
approvedReceivedQty = total receivedQuantity dari receipt APPROVED
pendingReservedQty = total receivedQuantity dari receipt SUBMITTED
availableQty = max(0, orderedQty - approvedReceivedQty - pendingReservedQty)
```

Saat membuat receipt, input valid berada pada rentang 0 sampai `availableQty`.

Multiple receipt pending diperbolehkan. Picker menampilkan warning jumlah receipt pending dan kuantitas yang sudah dicadangkan. Receipt pending yang ditolak atau item pending yang dihapus langsung melepaskan reservation.

### Konflik Antar-Receipt

Edit di approval modal boleh mengambil kuantitas yang sebelumnya dicadangkan receipt pending lain, selama total approved belum melampaui ordered quantity. Pending receipt lain tidak diubah otomatis. Receipt tersebut mendapat flag **Konflik Qty** jika kuantitasnya tidak lagi valid.

Contoh:

1. Pesanan 10.
2. Receipt A pending 6.
3. Receipt B pending 4.
4. Receipt A diedit menjadi 8 dan approved.
5. Receipt B tetap pending dengan input 4, tetapi sekarang maksimal 2 dan ditandai Konflik Qty.

Item konflik tidak dapat disetujui sebelum diedit. Total kuantitas approved tidak pernah boleh lebih besar dari ordered quantity.

## Status Sesuai dan Tidak Sesuai

Status dipilih manual:

- `MATCHED` ditampilkan sebagai **Sesuai**.
- `MISMATCHED` ditampilkan sebagai **Tidak Sesuai**.

Status tersebut menjelaskan apakah kiriman dianggap sesuai kesepakatan atau kondisi aktual, bukan apakah angkanya sama dengan expected quantity.

Contoh: pesanan 50, supplier mengonfirmasi hanya ready 40. User dapat memilih Sesuai, mengisi 40, dan memberi catatan "Supplier hanya ready 40".

Kewajiban catatan ditentukan oleh angka:

- `receivedQuantity === expectedQuantitySnapshot`: catatan opsional.
- `receivedQuantity !== expectedQuantitySnapshot`: catatan produk wajib.

Owner dapat mengedit match status, kuantitas, dan catatan di approval modal.

## Flow Pengajuan

1. User membuka Inventaris > Transaksi > Penerimaan Barang.
2. Picker memuat Pembelian Barang dengan `status = APPROVED`, `fulfillmentStatus != RECEIVED`, dan sisa tersedia lebih dari 0.
3. User memilih Pembelian Barang.
4. Sistem menampilkan supplier, nomor purchase, warning pending receipt, dan seluruh item yang masih memiliki sisa.
5. Setiap item menampilkan total dipesan, sudah approved diterima, pending, dan sisa tersedia.
6. User memilih Sesuai/Tidak Sesuai, mengisi kuantitas diterima, dan mengisi catatan bila ada selisih.
7. Semua item yang ditampilkan wajib memiliki input kuantitas valid.
8. Tombol **Ajukan Penerimaan Barang** membuat receipt `SUBMITTED`.
9. Receipt muncul di Riwayat Penerimaan Barang.

Input tidak boleh negatif, tidak boleh non-finite, dan tidak boleh melampaui available quantity saat pengajuan.

## Flow Review Individual Product

Receipt `SUBMITTED` dapat dibuka melalui modal review. Setiap line menampilkan:

- badge Sesuai/Tidak Sesuai;
- total dipesan;
- total approved diterima;
- reservation pending lain;
- kuantitas receipt ini;
- sisa terbaru;
- catatan;
- status Belum Ada Aksi/Disetujui;
- warning Konflik Qty bila ada.

### Approve Item

- Memerlukan `inventory.inbound_receipt.approve:update`.
- Menandai line sebagai `APPROVED`.
- Belum menambah stok.
- Menolak approval bila line konflik atau validasi catatan gagal.

### Edit Item

- Memerlukan `inventory.inbound_receipt.edit:update`.
- Dapat mengubah match status, received quantity, dan catatan.
- Ordered quantity dan source product tidak dapat diubah.
- Jika item sudah disetujui, tampil konfirmasi bahwa status akan kembali menjadi Belum Ada Aksi.
- Edit approved item menghapus metadata approval line dan mengembalikan `reviewStatus` ke `PENDING`.

### Remove Item

- Memerlukan `inventory.inbound_receipt.edit:update`.
- Minimal satu line harus tersisa.
- Item yang dihapus tidak dianggap diterima.
- Reservation item langsung dilepas.
- Kuantitas tersebut tetap outstanding di Pembelian Barang dan dapat diterima pada receipt berikutnya.

### Reject Receipt

- Memerlukan `inventory.inbound_receipt.reject:update`.
- Berlaku untuk seluruh receipt.
- Alasan wajib.
- Tidak menambah stok.
- Semua reservation receipt dilepas.
- Tidak ada aksi Minta Revisi.

## Finalisasi Atomik

Ketika seluruh line yang tersisa berstatus `APPROVED`, sistem menjalankan satu transaksi:

1. Lock receipt dan Goods Purchase.
2. Memuat ulang ordered, approved, dan pending quantities.
3. Memastikan cumulative approved setelah receipt ini tidak melebihi ordered quantity.
4. Memastikan semua line valid dan tidak konflik.
5. Menambah stok sesuai `receivedQuantity`.
6. Menggunakan mekanisme stock-group conversion existing.
7. Membuat inventory log `IN/RESTOCK` memakai `GoodsPurchaseItem.latestUnitPrice` sebagai unit cost.
8. Menghubungkan inventory log ke receipt line.
9. Mengubah receipt menjadi `APPROVED`.
10. Menghitung ulang `GoodsPurchase.fulfillmentStatus`.

Qty 0 tidak membuat stock delta atau inventory log.

Jika satu operasi gagal, seluruh transaksi rollback, termasuk approval item terakhir, stock delta, log, status receipt, dan fulfillment status. Finalisasi bersifat idempotent dan inventory log tidak boleh dibuat dua kali.

## Perhitungan Fulfillment Pembelian Barang

Perhitungan hanya memakai receipt baru dengan `goodsPurchaseId` dan status `APPROVED`.

- Belum ada approved received quantity: `NOT_RECEIVED`.
- Ada approved received quantity dan minimal satu item masih memiliki sisa: `PARTIALLY_RECEIVED`.
- Semua item terpenuhi tepat sampai ordered quantity: `RECEIVED`.
- Receipt approved dengan seluruh qty 0 tidak mengubah status menjadi partial.
- Receipt rejected dan receipt legacy tidak dihitung.

## RBAC

Permission owner-default:

- `inventory.inbound_receipt.approve:update`
- `inventory.inbound_receipt.reject:update`
- `inventory.inbound_receipt.edit:update`

Permission `inventory.inbound_receipt.revise:update` dihapus dari konfigurasi workflow baru.

Aturan:

- Role approve tanpa edit dapat menyetujui data apa adanya.
- Role edit tanpa approve dapat mengedit atau menghapus line, tetapi tidak dapat menyetujui.
- User pengaju tidak otomatis dapat mengedit setelah submit.
- Receipt final `APPROVED` atau `REJECTED` tidak dapat diedit.
- User tetap membutuhkan permission Inventaris existing untuk membuat Penerimaan Barang.

## UI Inventaris

### Modal Pengajuan

- Source picker berubah dari Invoice Daftar Belanja menjadi Pembelian Barang.
- Pembelian Barang default dapat diberikan dari entry point Supplier.
- Warning pending reservation ditampilkan dekat source dan per item.
- Input expected quantity tidak dapat diedit.
- Input received quantity wajib.
- Sesuai/Tidak Sesuai dapat dipilih manual.
- Catatan per item ditandai wajib secara dinamis saat qty berbeda.
- Submit button disabled sampai seluruh item valid.

### Riwayat Penerimaan Barang

- Menampilkan source nomor Pembelian Barang untuk data baru.
- Data legacy tetap menampilkan source Daftar Belanja.
- Filter status existing dipertahankan.
- Aksi Minta Revisi dihapus.
- Tombol Proses tampil bila user mempunyai minimal salah satu permission approve/edit/reject.
- Receipt conflict menampilkan badge/peringatan.

Deep link dapat menerima:

```text
/inventory?tab=transactions&subtab=inbound&goodsPurchaseId=<id>
```

Halaman otomatis membuka Transaksi > Penerimaan Barang dan memfilter history berdasarkan Pembelian Barang. Bila belum ada receipt, tampil empty state khusus.

## UI Supplier

### Label Status Pembelian Barang

- Purchase belum approved: label approval existing.
- Purchase approved + `NOT_RECEIVED`: **DISETUJUI**.
- Purchase approved + `PARTIALLY_RECEIVED`: **BARANG DITERIMA SEBAGIAN**.
- Purchase approved + `RECEIVED`: **BARANG DITERIMA**.

### Quick Button Barang Sudah Diterima?

- Tampil untuk status DISETUJUI dan BARANG DITERIMA SEBAGIAN.
- Disembunyikan untuk BARANG DITERIMA.
- Hanya tampil bagi user yang mempunyai permission update Inventaris.
- Membuka modal pengajuan yang sama dengan halaman Inventaris.
- Pembelian Barang pada row tersebut otomatis terpilih.
- Data sisa dan reservation selalu dimuat ulang dari server ketika modal dibuka.

Komponen modal dibuat shared agar aturan Supplier dan Inventaris identik.

### Quick Action Lihat Riwayat Penerimaan Barang

Setiap row riwayat Pembelian Barang memiliki action **Lihat Riwayat Penerimaan Barang**. Action membuka deep link Inventaris dan memfilter history berdasarkan purchase tersebut.

### Modal Perbandingan

Klik row Pembelian Barang dengan status BARANG DITERIMA SEBAGIAN atau BARANG DITERIMA membuka modal perbandingan.

Summary per produk:

- jumlah dipesan;
- total diterima dari receipt approved;
- total dalam receipt pending;
- sisa;
- fulfillment status.

Breakdown per batch:

- nomor/tanggal receipt;
- status receipt;
- quantity per product;
- badge Sesuai/Tidak Sesuai;
- catatan;
- approver dan waktu approval.

## API dan Service Boundaries

Repository bertanggung jawab atas query tenant-scoped, row locking, relasi persistence, stock mutation, dan inventory log.

Service bertanggung jawab atas:

- validasi source dan item;
- perhitungan quantity;
- note rules;
- conflict detection;
- permission-independent business rules;
- finalisasi dan fulfillment calculation.

API bertanggung jawab atas:

- autentikasi;
- RBAC;
- parsing payload;
- error mapping;
- response contract.

Client tidak dipercaya sebagai sumber ordered, approved, pending, available, atau unit cost.

Endpoint existing dapat diperluas untuk:

- eligible Goods Purchases;
- receiving comparison;
- item approve;
- item edit;
- item remove;
- header reject;
- history filter by `goodsPurchaseId`.

## Concurrency dan Error Handling

- Create memvalidasi available quantity terbaru di dalam transaction.
- Mutation receipt `SUBMITTED` melakukan row lock.
- Finalisasi lock receipt dan Goods Purchase dengan urutan konsisten.
- Approval dua receipt bersamaan diserialisasi pada Goods Purchase yang sama.
- Receipt yang kalah race mendapat response conflict dan data terbaru.
- Unknown source, cross-store source, inactive product, duplicate item, invalid quantity, missing note, stale status, dan over-receipt menghasilkan error terstruktur.
- Cache Inventory dan Supplier di-invalidasi setelah mutation yang memengaruhi reservation atau fulfillment.

## Legacy Compatibility

- Receipt tanpa `goodsPurchaseId` tetap tampil sebagai riwayat legacy.
- Legacy receipt tidak memengaruhi reservation atau fulfillment Goods Purchase.
- Receipt legacy tidak dimigrasikan otomatis.
- Status `NEEDS_REVISION` existing tetap dapat dibaca, tetapi workflow baru tidak menyediakan aksi Minta Revisi atau pengajuan ulang.
- Field relasi Daftar Belanja dipertahankan selama masih dibutuhkan untuk membaca data lama.

## Testing Strategy

### Domain

- ordered/approved/pending/available calculations;
- note requirement independent from match status;
- manual match status;
- partial and full fulfillment;
- zero-quantity receipt;
- conflict after another receipt approval.

### Repository dan Service

- tenant isolation;
- source eligibility;
- item membership and duplicate prevention;
- multiple pending reservations;
- reservation release on reject/remove;
- approve/edit/reset/remove item;
- minimum one line;
- atomic stock mutation;
- stock-group conversion;
- unit cost from Goods Purchase item;
- inventory log exactly once;
- concurrent finalization;
- no stock mutation before receipt finalization.

### RBAC dan API

- approve/reject/edit owner-default;
- revise permission removal;
- route permission enforcement;
- structured validation and conflict responses;
- history filter by Goods Purchase.

### UI

- Goods Purchase picker and default selection;
- warning pending reservations;
- Sesuai/Tidak Sesuai badges;
- dynamic note requirement;
- item action permission gates;
- conflict display;
- history and legacy labels;
- Supplier quick buttons;
- Inventory deep link;
- comparison summary and batch breakdown.

### Documentation

- Help page;
- visual help preview;
- AI Assistant workflow catalog;
- AI help FAQ;
- feature markdown documentation.

## Success Criteria

- Penerimaan baru tidak dapat dibuat dari Daftar Belanja.
- Penerimaan partial dapat diajukan berulang sampai purchase fully received.
- Total approved received tidak pernah melebihi ordered.
- Stok hanya berubah ketika receipt final approved.
- Receipt pending lain dapat menjadi konflik tanpa datanya diubah otomatis.
- Owner dapat memproses item individual dan reject seluruh dokumen.
- Supplier menampilkan fulfillment status yang benar.
- Quick modal dan history deep link bekerja dari Supplier.
- Legacy receipt tetap readable.
- Semua test relevan dan type-check lulus.
