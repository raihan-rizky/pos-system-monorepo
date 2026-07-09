# Custom Invoice Date Design

## Understanding Summary

- Sistem akan menambahkan tanggal dan waktu invoice khusus untuk transaksi.
- `invoiceDate` menjadi tanggal bisnis untuk nomor invoice, tampilan invoice, Riwayat, laporan keuangan, dashboard, dan PDF/struk.
- `createdAt` tetap menjadi waktu audit asli kapan record dibuat sistem.
- Hanya `OWNER` dan `ADMIN` yang boleh mengatur atau mengubah tanggal/waktu invoice khusus.
- Perubahan tanggal invoice dari Riwayat dapat mengganti nomor invoice/draft setelah konfirmasi eksplisit.
- Riwayat harus menampilkan tanggal invoice, waktu dibuat sistem, tanggal invoice sebelumnya, dan timeline audit lengkap.
- Draft memakai tanggal invoice yang sama untuk `draftNumber` dan nanti untuk nomor invoice final saat disetujui.

## Implementation Status

- `invoiceDate` dan `InvoiceDateChangeLog` ditambahkan ke Prisma schema beserta migration backfill.
- Create invoice, create draft, approve pending invoice, dan approve draft menerima tanggal invoice khusus untuk `OWNER`/`ADMIN`.
- Endpoint `PATCH /api/transactions/[id]/invoice-date` mengubah tanggal invoice/draft, regenerate nomor dokumen, update linked records yang aman, dan menulis audit log.
- Riwayat menampilkan tanggal invoice sebagai tanggal utama, `createdAt` sebagai "Dibuat", tanggal sebelumnya terbaru, badge "Tanggal diubah", dan action `Ubah Tanggal Invoice`.
- Detail invoice menampilkan timeline audit perubahan tanggal invoice.
- Laporan finance, jurnal, dashboard, PDF invoice, receipt, dan draft receipt memakai `invoiceDate` sebagai tanggal bisnis.
- Payment modal, approval modal, dan draft approval modal menampilkan field Tanggal/Jam Invoice hanya untuk `OWNER`/`ADMIN`.
- Bantuan menampilkan panduan `Mengubah Tanggal Invoice` untuk Owner dan Admin.
- AI Assistant workflow catalog memiliki panduan `custom-invoice-date` yang mengarah ke FAQ Q10 dan dibatasi untuk role `OWNER`/`ADMIN`.

## Assumptions

- Tambahkan kolom `invoiceDate` yang terindeks pada `Transaction`.
- Migrasi mengisi `invoiceDate` dari tanggal di `invoiceNumber` atau `draftNumber` jika valid, fallback ke `createdAt`.
- Saat migrasi, tanggal dari nomor dokumen memakai komponen jam dari `createdAt` agar urutan lama tetap stabil.
- Perubahan tanggal/nomor invoice, update linked record, dan audit log dilakukan atomik dalam satu transaksi database.
- Same-day custom time saat create/approval tidak wajib alasan.
- Past/future custom date saat create/approval wajib alasan.
- Edit dari Riwayat selalu wajib alasan.
- Jika invoice pending dari Sales sudah pernah dicetak lalu Owner/Admin mengganti tanggal/nomor saat approval, invoice lama dianggap outdated dan invoice final harus dicetak ulang.

## Non-Functional Requirements

- Performance: query Riwayat, laporan, dashboard, dan customer debt tidak boleh melambat signifikan. Tambahkan index `invoiceDate` untuk query tanggal bisnis.
- Scale: store-scoped daily sequence tetap cukup. Tidak perlu global sequence service.
- Security: hanya `OWNER` dan `ADMIN` yang dapat set/edit custom invoice date.
- Reliability: semua perubahan terkait invoice date dan numbering harus atomic.
- Maintenance: logika tanggal dan nomor dokumen dipusatkan di helper/domain transaction, bukan tersebar di UI.

## Decision Log

| Decision | Alternatives Considered | Reason |
| --- | --- | --- |
| Gunakan `invoiceDate` terpisah dari `createdAt`. | Rewrite `createdAt`; metadata JSON overlay. | Memisahkan tanggal bisnis dari audit time dan membuat query/report reliable. |
| `invoiceDate` mengontrol laporan, dashboard, Riwayat, receipt/PDF, dan nomor invoice. | Display-only date; reports tetap `createdAt`. | User ingin efek business-date penuh. |
| Custom date dapat mengubah nomor invoice/draft. | Nomor tetap; regenerate otomatis tanpa konfirmasi. | Nomor dokumen adalah identitas invoice, jadi perubahan harus sadar dan terkonfirmasi. |
| Owner/Admin saja yang boleh set/edit custom date. | Cashier/Sales ikut boleh; semua role sesuai permission create. | Mengurangi risiko manipulasi periode dan nomor invoice. |
| Past/future date diperbolehkan. | Block future/past; current month only. | Operasional membutuhkan fleksibilitas, dengan audit dan reason. |
| Existing invoice edit wajib reason dan structured audit. | Activity note sederhana; no audit. | Perubahan nomor/tanggal invoice berdampak akuntansi. |
| Linked records diperbarui bila memungkinkan. | Snapshot dibiarkan; block jika ada linked records. | Tampilan operasional harus konsisten dengan invoice terbaru. |
| History table/card menampilkan latest previous invoice date; detail menampilkan full timeline. | Tampilkan full history di table; hanya latest change. | Table tetap ringkas, detail tetap lengkap. |
| Date/time optional. Jika edit tanpa time, preserve time lama. Jika create date-only, pakai waktu checkout/approval pada tanggal pilihan. | Date-only; latest invoice time pada tanggal itu. | User ingin bisa mengatur time, tapi default tetap otomatis. |
| Draft date edit regenerate `draftNumber` dan dipakai saat approve final invoice. | Draft number tetap; pilih ulang saat approval. | Draft perlu konsisten sejak dibuat sampai final. |
| Saat pindah tanggal, pertahankan suffix lama jika available; jika tidak, pakai next highest. | Always next highest; lowest available gap. | Menjaga kontinuitas identitas dokumen saat memungkinkan. |

## Data Model

Tambahkan field pada `Transaction`:

```prisma
invoiceDate DateTime @default(now())
```

Tambahkan index minimal:

```prisma
@@index([storeId, invoiceDate(sort: Desc)])
@@index([storeId, status, invoiceDate(sort: Desc)])
```

Tambahkan model audit, misalnya:

```prisma
model InvoiceDateChangeLog {
  id                String   @id @default(cuid())
  transactionId     String
  storeId           String
  oldInvoiceDate    DateTime
  newInvoiceDate    DateTime
  oldDocumentNumber String?
  newDocumentNumber String?
  reason            String
  actorId           String?
  actorName         String
  actorRole         Role
  createdAt         DateTime @default(now())

  transaction Transaction @relation(fields: [transactionId], references: [id])

  @@index([transactionId, createdAt])
  @@index([storeId, createdAt])
}
```

Jika nama relation atau enum Role perlu disesuaikan dengan schema existing, ikuti pola Prisma lokal.

## Numbering Rules

Nomor final invoice tetap memakai format:

```text
INV-YYYYMMDD-####
```

Draft tetap memakai format existing `draftNumber`, tetapi tanggal di dalamnya berasal dari `invoiceDate`.

Rules:

- Create normal tanpa custom date memakai server now.
- Owner/Admin create dengan custom date dan time memakai timestamp yang dipilih.
- Owner/Admin create dengan custom date tanpa time memakai waktu checkout/approval saat itu, tetapi tanggalnya dari tanggal pilihan.
- Edit existing tanpa custom time mempertahankan time lama dari `invoiceDate`.
- Edit existing dengan custom time memakai time yang dipilih.
- Regenerate number menjaga suffix lama jika suffix itu available pada tanggal baru.
- Jika suffix lama sudah dipakai, gunakan next highest suffix untuk tanggal dan document type itu.
- Semua numbering berjalan dalam DB transaction dan retry jika terjadi unique collision.

## API Design

Extend route berikut:

- `POST /api/transactions`
- `POST /api/transactions/draft`
- `POST /api/transactions/[id]/approve`
- `POST /api/transactions/[id]/approve-draft`

Tambah endpoint:

```text
PATCH /api/transactions/[id]/invoice-date
```

Payload edit:

```ts
{
  invoiceDate: string;
  invoiceTime?: string | null;
  regenerateNumber: true;
  reason: string;
}
```

Behavior:

- Validasi role `OWNER`/`ADMIN`.
- Validasi reason wajib untuk edit.
- Validasi explicit confirmation untuk number regeneration.
- Hitung `invoiceDate` baru.
- Regenerate `invoiceNumber` atau `draftNumber`.
- Update linked records yang aman diubah.
- Insert `InvoiceDateChangeLog`.
- Return transaction terbaru plus latest change summary.

Untuk create/approval payload dapat menambahkan:

```ts
{
  invoiceDate?: string;
  invoiceTime?: string | null;
  invoiceDateReason?: string | null;
}
```

Jika role bukan `OWNER`/`ADMIN` mengirim custom date, API sebaiknya reject dengan pesan Indonesia yang jelas agar misuse tidak diam-diam terjadi.

## Linked Records

Update linked record yang menyimpan atau menampilkan nomor invoice snapshot bila memungkinkan:

- `ProductionActivityLog.invoiceNumber`
- `SuratJalan.invoiceNumberSnapshot` atau field snapshot sejenis
- system-generated inventory note dengan prefix yang dikenal
- future receipt/PDF payload via `transaction.invoiceDate`
- debt/payment display yang membaca transaction akan ikut berubah otomatis

Untuk free-text note, hanya rewrite pola system-generated yang aman, misalnya:

- `Penjualan INV-*`
- `Approve Penjualan INV-*`
- `Offline sync INV-*`
- `Approve Draft ... -> INV-*`

Jangan rewrite catatan user bebas.

## UI Design

### Payment / Approval

- Owner/Admin melihat field tanggal invoice dan optional time.
- Cashier/Sales tidak melihat field ini.
- Jika Owner/Admin memilih past/future date saat create/approval, tampilkan input alasan.
- Same-day custom time tidak wajib alasan.
- Jika Sales pending invoice berubah saat approval, tampilkan pesan bahwa invoice final perlu dicetak ulang.

### History

Table/card:

- Tanggal utama: `invoiceDate`
- Audit label: `Tanggal dibuat sistem` dari `createdAt`
- Jika pernah berubah: `Sebelumnya: <tanggal invoice lama terbaru>`

Detail panel/modal:

- Full audit timeline: old/new date, old/new number, actor, change timestamp, reason.
- Owner/Admin-only action untuk edit tanggal invoice.
- Modal edit berisi date, optional time, reason, dan konfirmasi perubahan nomor.

## Reports And Dashboard

Ganti filter/grouping tanggal transaksi dari `createdAt` ke `invoiceDate` untuk:

- History date filters
- Dashboard today/month/last-7/last-30 summaries
- Finance report date bounds
- Journal export tanggal transaksi
- Customer/sales recap yang bersifat business-period view

Operational audit views tetap boleh memakai `createdAt` jika maksudnya adalah waktu event sistem.

## Receipt And PDF

- Receipt modal menampilkan `invoiceDate`.
- Invoice PDF data builder memakai `invoiceDate`.
- Draft receipt/PDF memakai `invoiceDate`.
- `createdAt` tidak tampil sebagai tanggal invoice, kecuali pada History audit metadata.

## Testing Plan

Gunakan TDD saat implementasi.

Test utama:

- Migration/backfill parse `invoiceNumber` atau `draftNumber`, fallback ke `createdAt`.
- Create transaction menerima custom date hanya untuk Owner/Admin.
- Same-day custom time tidak memerlukan reason.
- Past/future custom date memerlukan reason.
- Invoice number memakai tanggal dari `invoiceDate`.
- Edit mempertahankan time lama jika time omitted.
- Edit mempertahankan suffix lama jika available, fallback ke next highest.
- Edit menulis audit log dan update linked records atomik.
- Draft date edit regenerate `draftNumber`.
- Draft approval memakai `invoiceDate` draft untuk final `invoiceNumber`.
- Reports/dashboard/history filters memakai `invoiceDate`.
- Receipt/PDF memakai `invoiceDate`.
- History UI menampilkan `invoiceDate`, `createdAt`, latest previous date, dan full timeline.

Risk tests:

- Concurrent numbering collision retries.
- Future invoice date masuk ke future report period.
- Sales pending invoice yang sudah dicetak menjadi outdated setelah Owner/Admin mengubah date/number saat approval.

## Implementation Plan

1. Tambahkan failing tests untuk domain helper numbering dan date resolution.
2. Tambahkan Prisma schema, migration, index, audit model, dan backfill SQL.
3. Implement shared helper untuk resolve invoice timestamp dan generate/regenerate document number.
4. Extend create transaction dan draft create API.
5. Extend approval dan draft approval API.
6. Tambahkan `PATCH /api/transactions/[id]/invoice-date`.
7. Update transaction fetch types/API response dengan `invoiceDate`, latest summary, dan full audit detail endpoint.
8. Update History filters/UI.
9. Update reports, journal, dashboard, customer/sales recap.
10. Update receipt modal, draft receipt, invoice PDF, and draft PDF.
11. Update Help page and AI Assistant workflow catalog.
12. Jalankan targeted tests dan type-check sesuai repo workflow.

## Risks

- Banyak query saat ini memakai `createdAt`; perlu audit menyeluruh agar tidak ada report yang masih salah periode.
- Rewriting linked free-text notes berisiko mengubah catatan user, jadi harus dibatasi ke known system-generated patterns.
- Invoice number regeneration dapat memengaruhi invoice yang sudah dicetak; UI harus jelas bahwa final invoice perlu dicetak ulang.
- Future invoice date akan menggeser revenue ke periode masa depan; ini disengaja dan perlu terlihat di report.
