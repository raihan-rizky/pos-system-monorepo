# Desain Peningkatan Verifikasi Log OUT Inventaris

Tanggal: 2026-06-30

## Status Dokumen

Desain telah divalidasi, disetujui, dan diimplementasikan dengan TDD. Pembaruan implementasi dicatat pada 2026-07-01.

Artefak implementasi utama:

- Antrean khusus `Log OUT Belum Diverifikasi` di tab Tugas Harian.
- RBAC baru `inventory.out_log.verify:update` dengan default OWNER, ADMIN, dan INVENTORY.
- API `GET/POST /api/inventory-management/log-verifications` untuk queue, status verifikasi, request koreksi, dan approval/reject koreksi.
- Model audit `InventoryLogCorrectionRequest` dan `InventoryLogCorrectionMovement`.
- Blocker matching/check-out memakai status unresolved, bukan hanya verification kosong.
- Stock Log menampilkan warna dan badge verifikasi secara read-only tanpa tombol `Setujui`, `Perlu Koreksi`, atau `Koreksi`.
- Help page dan AI Assistant workflow catalog sudah disinkronkan dengan alur final.

## Latar Belakang

Task `Log OUT Belum Diverifikasi` pada halaman Inventaris menghitung Log OUT `APPROVED` hari berjalan yang beralasan `USAGE` atau `MANUAL_ADJUSTMENT` dan belum memiliki verifikasi. Task tersebut saat ini hanya membuka tabel Stock Log umum.

Tabel Stock Log belum memuat status maupun aksi verifikasi. Akibatnya, pengguna dapat melihat jumlah pekerjaan, tetapi tidak dapat menyelesaikan verifikasi dari UI. Daily matching dan check-out tetap diblokir oleh pekerjaan tersebut.

## Understanding Summary

- Task `Log OUT Belum Diverifikasi` membuka antrean verifikasi khusus untuk Log OUT hari berjalan.
- Verifikasi hanya menilai kebenaran catatan sebagai `Sesuai` atau `Perlu Koreksi`; verifikasi tidak menghitung stok fisik.
- Matching Stok tetap menjadi proses terpisah yang membandingkan stok sistem dengan stok fisik per produk.
- Antrean khusus menjadi satu-satunya tempat untuk aksi `Setujui`, `Perlu Koreksi`, dan `Koreksi`.
- Baris pada Stock Log hanya mencerminkan warna dan badge verifikasi yang sama, tanpa aksi verifikasi atau koreksi.
- Koreksi mencakup produk, jumlah, alasan, dan catatan yang benar tanpa mengubah Log OUT approved asli.
- Koreksi stok mengikuti maker-checker dan hanya diterapkan setelah approval sesuai RBAC.

## Tujuan

1. Membuat task Log OUT dapat diselesaikan end-to-end dari halaman Inventaris.
2. Memberi status visual yang konsisten pada antrean verifikasi dan Stock Log.
3. Menjaga Log OUT approved tetap immutable dan dapat diaudit.
4. Memastikan koreksi produk/jumlah diterapkan secara atomik.
5. Menjaga daily matching dan check-out terblokir sampai seluruh masalah benar-benar selesai.
6. Memisahkan permission verifikasi dari permission update inventaris umum.

## Non-Goals

- Menghitung atau memasukkan stok fisik dalam proses verifikasi Log OUT.
- Mengedit langsung Log OUT yang sudah `APPROVED`.
- Verifikasi lintas toko.
- Bulk verification; volume yang disepakati maksimal sekitar 50 log per toko per hari.
- Mengubah aturan approval stok umum di luar koreksi Log OUT.
- Menambahkan dukungan offline.

## Asumsi dan Non-Functional Requirements

### Performa dan Skala

- Beban normal maksimal sekitar 50 Log OUT eligible per toko per hari.
- Antrean menggunakan query khusus, pagination, dan filter server-side.
- Payload tidak memuat histori inventaris yang tidak relevan.
- Mutasi hanya menyegarkan antrean, ringkasan task, matching, dan Stock Log yang terdampak.

### Keamanan dan Privasi

- Semua query dan mutasi wajib menggunakan `storeId` pengguna yang terautentikasi.
- API selalu memvalidasi permission; kondisi tampilan tombol bukan kontrol keamanan.
- Catatan koreksi dibatasi panjangnya dan divalidasi server-side.
- Verifikator, requester koreksi, approver, waktu keputusan, serta alasan penolakan disimpan sebagai audit trail.
- Pembuat request koreksi tidak boleh menyetujui request miliknya sendiri.

### Reliabilitas

- Mutasi status dan approval memakai pemeriksaan status/versi untuk mencegah lost update.
- Request berulang harus idempotent atau menghasilkan `409 Conflict` yang aman.
- Approval koreksi dan seluruh dampak stok dilakukan dalam satu transaksi database.
- Kegagalan tidak boleh meninggalkan perubahan stok parsial.
- UI melakukan rollback status visual dan mempertahankan input form jika request gagal.

### Pemeliharaan

- Implementasi ditempatkan di feature `inventory-management`.
- Badge dan warna status berasal dari satu helper/komponen bersama.
- Logika transisi status dan kalkulasi koreksi dipisahkan dari komponen UI.
- Perubahan dilaksanakan dengan TDD dan tanpa menjalankan `pnpm build` pada sesi agent.

## Pendekatan yang Dipertimbangkan

### A. Antrean dan API Verifikasi Khusus — Dipilih

Task membuka panel khusus dengan API dan state machine terfokus. Stock Log hanya mengonsumsi presentasi status read-only.

Alasan dipilih:

- Memisahkan workflow operasional dari tabel histori umum.
- Risiko regresi pada Stock Log lebih rendah.
- Mendukung form koreksi dan approval dengan ruang yang memadai.
- Lebih mudah diuji dan dikembangkan.

### B. Mode Khusus pada Stock Log

Komponen Stock Log dipakai ulang dalam mode verifikasi. Pendekatan ini mengurangi komponen awal, tetapi menambah banyak cabang mode pada komponen yang sudah besar dan meningkatkan risiko regresi.

### C. Antrean Inline di Kartu Task

Seluruh daftar dibuka di bawah kartu task. Pendekatan ini cepat untuk daftar kecil, tetapi kurang sesuai untuk mobile dan form koreksi produk/jumlah.

## Desain UX

### Pembukaan Antrean

- Klik task `Log OUT Belum Diverifikasi` membuka panel penuh di tab `Tugas`.
- Panel bukan modal agar daftar dan form koreksi tetap nyaman pada desktop dan mobile.
- Tombol kembali mengembalikan pengguna ke daftar task.
- Header menampilkan tanggal Jakarta, jumlah setiap status, dan progres penyelesaian.

### Isi Baris

Setiap baris menampilkan:

- waktu Log OUT;
- produk, SKU, dan unit;
- jumlah OUT;
- alasan;
- pemohon/pencatat;
- catatan;
- status verifikasi dan status koreksi;
- aksi yang diizinkan untuk pengguna saat ini.

### Perubahan Visual

- `Belum Diverifikasi`: tampilan netral/amber dengan tombol `Setujui` dan `Perlu Koreksi`.
- `Sesuai`: baris dan badge positif/hijau. Sebelum dikunci, tombol lawan memungkinkan pengguna menandai `Perlu Koreksi`.
- `Perlu Koreksi`: baris dan badge peringatan/merah atau amber, serta tombol `Koreksi`.
- `Menunggu Approval`: badge progres dan aksi verifikasi yang dapat menciptakan konflik dinonaktifkan.
- `Koreksi Ditolak`: tetap `Perlu Koreksi`, tampilkan alasan penolakan, dan izinkan pengajuan ulang.
- `Siap Diverifikasi Ulang`: koreksi sudah diterapkan, tetapi pengguna masih harus menekan `Setujui`.

Perubahan warna dilakukan segera saat aksi status dikirim. Tombol dinonaktifkan selama request. Jika request gagal, UI mengembalikan status sebelumnya dan menampilkan pesan Indonesia yang dapat ditindaklanjuti.

### Stock Log

- Payload Stock Log menyertakan ringkasan verifikasi.
- Baris Log OUT eligible memakai helper badge/warna yang sama dengan antrean.
- Stock Log tidak menyediakan tombol `Setujui`, `Perlu Koreksi`, atau `Koreksi`.
- Aksi approval inventaris lain yang sudah ada tidak diubah oleh aturan read-only ini.

## Komponen

- `OutLogVerificationPanel`: query antrean, filter, progres, loading, error, dan empty state.
- `OutLogVerificationRow`: representasi responsif desktop/mobile.
- `OutLogVerificationBadge`: label, warna, dan ikon status bersama.
- `OutLogCorrectionForm`: nilai asli, nilai benar, preview dampak stok, dan submit request.
- Helper transisi status: menentukan aksi valid dan status turunan.
- Helper koreksi stok: menghitung reversal/replacement atau net delta.
- `InventoryWorkspace`: membuka/menutup panel dan menyegarkan ringkasan task.

## State Machine

Status utama menggunakan `InventoryLogVerification`:

- tidak ada record atau `UNVERIFIED` → `Belum Diverifikasi`;
- `VERIFIED` → `Sesuai`;
- `MISMATCH` → `Perlu Koreksi`.

Status koreksi diturunkan dari request koreksi terbaru:

- tidak ada request;
- `PENDING` → `Menunggu Approval`;
- `REJECTED` → `Koreksi Ditolak`;
- `APPROVED` dan verifikasi masih `MISMATCH` → `Siap Diverifikasi Ulang`.

Transisi utama:

1. `Belum Diverifikasi` → `Sesuai` melalui `Setujui`.
2. `Belum Diverifikasi` atau `Sesuai` → `Perlu Koreksi` melalui aksi lawan.
3. `Perlu Koreksi` → request koreksi `PENDING` melalui form `Koreksi`.
4. Request `PENDING` → `APPROVED` atau `REJECTED` oleh approver lain.
5. Koreksi `APPROVED` → `Sesuai` hanya setelah verifikasi ulang.

Status dapat dibalik sebelum ada request koreksi pending. Ketika request pending, pengguna harus menyelesaikan atau membatalkan request terlebih dahulu. Semua transisi dikunci setelah daily matching disubmit atau sesi inventaris check-out.

## Model Data

`InventoryLogVerification` tetap menjadi sumber status verifikasi. Perhitungan pekerjaan belum selesai harus mencakup:

- Log OUT eligible tanpa verification;
- verification `UNVERIFIED`;
- verification `MISMATCH`, termasuk koreksi pending, ditolak, atau approved tetapi belum diverifikasi ulang.

Koreksi menggunakan entitas audit khusus, secara konseptual:

```prisma
model InventoryLogCorrectionRequest {
  id                    String
  storeId               String
  inventoryLogId        String
  correctedProductId    String
  correctedQuantity     Float
  correctedReason       InventoryReason
  correctedNote         String?
  status                InventoryLogCorrectionStatus
  requestedBy           String
  decidedBy             String?
  decidedAt             DateTime?
  rejectionReason       String?
  version               Int
  createdAt             DateTime
  updatedAt             DateTime
  movements             InventoryLogCorrectionMovement[]
}

model InventoryLogCorrectionMovement {
  id                    String
  correctionRequestId   String
  inventoryLogId        String
  kind                  InventoryLogCorrectionMovementKind
}
```

Nama field dan relasi final mengikuti konvensi Prisma repository. Request harus mendukung beberapa percobaan koreksi untuk satu Log OUT agar request yang ditolak tetap memiliki histori.

## Kalkulasi Koreksi Stok

Log OUT asli tidak diubah atau dihapus.

Jika produk tidak berubah:

```text
delta = jumlah OUT asli - jumlah OUT yang benar
```

- Positif mengembalikan stok yang terlalu banyak dikurangi.
- Negatif mengurangi kekurangan OUT.
- Nol berarti hanya metadata yang dikoreksi dan tidak perlu mutasi stok.

Jika produk berubah:

1. Produk asli menerima adjustment `+jumlah asli` untuk membalik dampak OUT salah.
2. Produk benar menerima adjustment `-jumlah benar` untuk menerapkan dampak yang seharusnya.

Movement dibuat sebagai `ADJUSTMENT` signed dengan alasan audit `MANUAL_ADJUSTMENT`. Approval menyimpan requester sebagai pembuat dan approver sebagai pengambil keputusan. Semua movement dan status request dibuat dalam satu transaksi.

## Daily Matching Efektif

Daily matching tidak boleh memakai Log OUT salah setelah koreksi disetujui. Resolver movement efektif digunakan:

- Log OUT `VERIFIED` tanpa koreksi approved memakai produk/jumlah asli.
- Log OUT `VERIFIED` dengan koreksi approved memakai produk/jumlah/alasan yang telah dikoreksi.
- Log `MISMATCH` tidak dapat diteruskan karena tetap menjadi blocker.

Current product stock sudah mencerminkan adjustment koreksi. Pengelompokan matching memakai movement efektif sehingga `totalOut` dan `stockBeforeOut` tetap merepresentasikan kejadian bisnis yang benar tanpa menghitung koreksi dua kali.

## API Design

Rute final dapat disesuaikan dengan konvensi route repository, dengan kontrak konseptual:

- `GET /api/inventory-management/log-verifications?dateKey=...&status=...&page=...`
- `POST/PATCH /api/inventory-management/log-verifications/[inventoryLogId]`
- `POST /api/inventory-management/log-verifications/[inventoryLogId]/corrections`
- `POST /api/inventory-management/log-corrections/[id]/approve`
- `POST /api/inventory-management/log-corrections/[id]/reject`
- `POST /api/inventory-management/log-corrections/[id]/cancel` bila pembatalan diperlukan

Respons antrean memuat Log OUT, verification, request koreksi terbaru, dan capability flags. Mutasi membawa `updatedAt` atau `version`. Data stale menghasilkan `409 Conflict` dan UI memuat ulang baris.

Endpoint Stock Log menambahkan relasi/ringkasan verification dan koreksi tanpa mengekspos aksi mutasi baru.

## RBAC

Tambahkan resource target:

```text
inventory.out_log.verify
```

Aturan:

- baca antrean/status: `inventory:read`;
- set `Sesuai`/`Perlu Koreksi` dan membuat request: `inventory.out_log.verify:update`;
- approve/reject koreksi stok: `inventory.approve:update`;
- default `inventory.out_log.verify:update`: `OWNER`, `ADMIN`, dan `INVENTORY`;
- `CASHIER` dan `SALES` tidak mendapat default permission;
- permission baru tampil pada modul RBAC Inventory/Approval Inventory sesuai sensitivitasnya.

API approval koreksi wajib menolak `requestedBy === approver.id`, termasuk ketika requester adalah Owner. Konsekuensinya, koreksi yang dibuat Owner memerlukan Owner lain yang memiliki `inventory.approve`. Ini adalah konsekuensi eksplisit dari keputusan maker-checker tanpa self-approval.

## Validasi dan Edge Cases

- Hanya Log OUT `APPROVED` hari berjalan dengan alasan eligible yang dapat diverifikasi.
- Tanggal menggunakan batas hari Asia/Jakarta.
- Log dan produk target harus berasal dari toko pengguna.
- Produk target koreksi harus aktif dan valid.
- Jumlah benar harus lebih besar dari nol dan finite.
- Request koreksi pending mencegah request koreksi kedua.
- Request ditolak mempertahankan `MISMATCH` dan dapat diajukan ulang.
- Approval gagal jika dampak negatif menyebabkan stok produk benar tidak mencukupi.
- Approval gagal tanpa perubahan parsial jika satu movement tidak valid.
- Setelah matching/check-out, endpoint mutasi mengembalikan conflict/locked response.
- Empty state menampilkan bahwa seluruh Log OUT sudah diverifikasi.
- Perubahan bersamaan ditangani melalui status check dan version guard.
- Badge tidak boleh menandai `MISMATCH` sebagai pekerjaan selesai.

## Error Handling

- `400/422`: input tidak valid, produk tidak aktif, jumlah invalid, atau stok tidak cukup.
- `403`: permission tidak cukup, scope toko salah, atau self-approval.
- `404`: Log OUT/request/produk tidak ditemukan dalam scope toko.
- `409`: data stale, request sudah diputuskan, request pending ganda, atau workflow sudah dikunci.
- `500`: kegagalan tidak terduga; transaksi wajib rollback.

Pesan user-facing menggunakan bahasa Indonesia yang ramah dan spesifik. Form koreksi mempertahankan input pada kegagalan yang dapat diperbaiki.

## Strategi Pengujian

Implementasi mengikuti test-driven development: test relevan ditulis dan dibuktikan gagal sebelum implementasi produksi.

### Unit Test

- Transisi state dan capability action.
- Kalkulasi delta produk sama.
- Kalkulasi reversal/replacement produk berbeda.
- Koreksi metadata tanpa mutasi stok.
- Mapping badge/warna/status turunan.
- Resolver movement efektif untuk daily matching.

### API Test

- Scope toko dan tanggal Jakarta.
- Eligibility Log OUT.
- Default dan override RBAC permission.
- Maker-checker dan larangan self-approval.
- Version conflict dan double-submit.
- Approval/rejection/cancellation request koreksi.
- Transaksi atomik dan rollback ketika stok tidak cukup.
- Lock setelah matching/check-out.
- Mismatch tetap dihitung sebagai blocker.

### Component Test

- Task membuka panel khusus.
- Baris menampilkan data operasional yang diperlukan.
- `Setujui` dan `Perlu Koreksi` mengganti warna/badge.
- Tombol `Koreksi` hanya tampil pada state valid.
- Optimistic state rollback ketika API gagal.
- Aksi disembunyikan/dinonaktifkan sesuai capability.
- Layout desktop dan mobile.
- Stock Log menampilkan badge dan warna tanpa aksi verifikasi.

### Integration Test

- Ringkasan task berkurang hanya setelah status final `Sesuai`.
- `MISMATCH`, koreksi pending, dan koreksi approved yang belum diverifikasi ulang tetap memblokir matching/check-out.
- Koreksi approved mengubah stok tepat satu kali.
- Daily matching menggunakan produk dan jumlah efektif hasil koreksi.
- Status antrean dan Stock Log konsisten setelah refresh.

Verifikasi implementasi menggunakan test terfokus, lint, dan type-check. `pnpm build` tidak dijalankan dalam sesi agent.

## Dokumentasi Pengguna yang Harus Disinkronkan Saat Implementasi

- Perbarui `HelpContent.tsx` dengan alur verifikasi, koreksi, approval, dan verifikasi ulang.
- Perbarui workflow catalog AI Assistant untuk task `Log OUT Belum Diverifikasi`.
- Perbarui dokumen ini jika keputusan implementasi mengubah kontrak desain.

## Decision Log

| Keputusan | Alternatif | Alasan |
| --- | --- | --- |
| Pisahkan verifikasi dari matching. | Gabungkan keduanya. | Verifikasi memeriksa catatan; matching memeriksa stok fisik. |
| Gunakan antrean dan API khusus. | Mode Stock Log; antrean inline. | Isolasi workflow, ruang koreksi, dan risiko regresi lebih rendah. |
| Panel penuh di tab Tugas. | Modal. | Lebih sesuai untuk hingga 50 baris dan form koreksi responsif. |
| Stock Log hanya menampilkan warna/badge. | Aktifkan aksi verifikasi di Stock Log. | Mutasi tetap terpusat dan histori tidak menjadi workflow kedua. |
| Simpan status di backend. | State visual lokal. | Konsistensi lintas tampilan, user, dan refresh. |
| Tambahkan permission `inventory.out_log.verify`. | Pakai `inventory:update`. | Permission umum terlalu luas dan sulit dikonfigurasi secara aman. |
| Default verify untuk Owner/Admin/Inventory. | Owner/Admin saja; Owner saja. | Task harian tetap dapat diselesaikan staf inventaris. |
| Log approved asli immutable. | Edit langsung. | Menjaga audit dan histori stok. |
| Gunakan request koreksi khusus dan adjustment atomik. | Dua request adjustment independen. | Mencegah approval parsial saat produk berubah. |
| Gunakan maker-checker tanpa self-approval. | Auto-apply; self-approval. | Mencegah perubahan stok sepihak. |
| Mismatch tetap menjadi blocker. | Anggap verifikasi selesai dengan warning. | Matching/check-out tidak boleh lanjut dengan data yang diketahui salah. |
| Verifikasi ulang setelah koreksi approved. | Otomatis menjadi sesuai. | Pengguna tetap memastikan hasil koreksi benar. |
| Status dapat dibalik sebelum matching. | Status final sejak klik pertama. | Memungkinkan pemulihan dari salah klik tanpa mengubah histori terkunci. |
| Tidak menyediakan bulk verification. | Bulk selected/all. | Volume maksimal sekitar 50 dan setiap catatan harus diperiksa. |

## Risiko yang Diketahui

- Owner yang membuat koreksi tidak dapat menyetujui koreksinya sendiri dan memerlukan Owner lain. Ini mengikuti keputusan maker-checker yang telah disetujui.
- Perhitungan blocker yang lama hanya mencari `verification: null`; seluruh query terkait harus diperbarui agar `MISMATCH` tidak dianggap selesai.
- Daily matching saat ini membaca Log OUT mentah; resolver movement efektif wajib digunakan agar koreksi produk/jumlah tidak dihitung salah.
- Stock Log merupakan komponen besar; perubahan harus dibatasi pada payload status dan presentasi badge/warna.
- Worktree sudah memiliki perubahan lain pada inventory, RBAC, Help, dan workflow catalog; implementasi harus mempertahankan serta mengintegrasikan perubahan tersebut tanpa menimpanya.
