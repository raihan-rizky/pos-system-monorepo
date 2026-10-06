# Rencana Perbaikan Patch Besar POS — 6 Oktober 2026

> Untuk pelaksana: gunakan skill executing-plans, systematic-debugging, dan test-driven-development. Implementasi delapan temuan telah selesai. Hasil, pengujian, dan batas verifikasi tercatat pada [Hasil perbaikan](patch-besar-pos-review-fixes-2026-10-06.md). Daftar tugas di bawah dipertahankan sebagai referensi rencana awal; hasil aktual mengacu pada dokumen tersebut. Pada permintaan awal, delegasi, commit, push, dan deployment tidak termasuk cakupan. Pengguna kemudian meminta commit dan merge lokal ke `main` pada 6 Oktober 2026; push dan deployment tetap belum diminta.

**Goal:** Memperbaiki seluruh delapan temuan review sebelum patch besar dirilis bersama.

**Architecture:** Pertahankan alur Next.js/Prisma yang ada. Stok, jurnal, status, pembayaran awal, dan saldo pelanggan harus konsisten dalam satu transaksi database. Pisahkan tanggal invoice untuk penjualan dari tanggal ledger untuk penerimaan uang. Pakai sumber waktu server tersinkron yang sama pada tampilan dan penyimpanan.

**Tech stack:** TypeScript, Next.js 15 App Router, Prisma/PostgreSQL, Vitest, Playwright, pnpm.

## Keputusan dan batas global

- Satu rilis besar, dengan tahap pengerjaan internal yang dapat diuji secara terpisah.
- Transaksi final mengurangi stok saat dibuat; nota pending/draft mengurangi stok saat disetujui. Void/hapus mengembalikan pengurangan yang terbukti tepat satu kali, termasuk bahan baku dan satuan kelompok.
- Transaksi dengan Surat Jalan tertaut tetap mengikuti aturan yang disepakati: delete ditolak, void tersedia setelah dokumen pending diselesaikan/dibatalkan.
- Bukti stok legacy yang ambigu tetap mendapat 409. Perbaikan memperluas dukungan untuk pola yang terbukti, bukan menebak dari jumlah item atau mengganti semua sumber stok historis.
- Delete default Owner dan izin penerimaan/pembelian tetap configurable melalui RBAC. Tidak mengubah kategori pelanggan atau mengaktifkan pembaruan modal master otomatis.
- Harga khusus/diskon kategori tetap utama. Perubahan metadata item tidak menonaktifkan requote/fingerprint atau mengubah kebijakan harga.
- Jumlah produk dan jumlah layanan tetap bilangan bulat positif sesuai kontrak API saat ini; jumlah bahan baku tetap dapat berupa desimal.
- Tanggal/jam memakai Asia/Jakarta (WIB). Invoice yang diatur manual tetap tunduk pada izin Owner/Admin dan alasan beda hari.
- Tidak menjalankan pnpm build, root pnpm lint, atau perintah Turbo yang memicu build. Tidak memulai/menghentikan server dev milik pengguna.
- Tidak menambah dependency kecuali terbukti perlu. Semua teks baru untuk pengguna memakai bahasa Indonesia; antislop digunakan selama pengerjaan.
- Gunakan direktori markdown-files pada proyek C: sesuai persetujuan pengguna sebelumnya.
- Setiap tugas kode dimulai dari tes reproduksi yang gagal, baru implementasi, lalu tes yang lulus. Hasil 49 tes review yang lulus bukan bukti delapan bug ini sudah tertutup.
- Headroom stats pada awal/akhir dan kompresi output besar bila MCP tersedia. Tool Headroom tidak tersedia saat awal penyusunan rencana, lalu muncul menjelang akhir; stats dan kompresi pemeriksaan dokumen berhasil dipanggil. Proxy lokal tetap tidak terjangkau. Output pembacaan dibatasi dan kredensial tidak dibaca.
- Sebelum mengubah setiap simbol, jalankan impact upstream GitNexus dan laporkan direct callers, affected processes, serta risiko. Perbarui indeks jika helper baru tidak dikenali. Review sebelumnya: 117 file terpetakan, 220 simbol, 40 proses, risiko CRITICAL; indeks belum mengenali reverseTransaction dan FTS terdegradasi.
- Gunakan database dev sesuai instruksi pengguna hanya untuk fixture uji khusus, tanpa reset/seed/pengubahan data bisnis yang ada. Tes migrasi atau concurrency memakai database/schema sementara dengan pencatatan dan cleanup fixture yang dibuat pengujian.

## Pilihan pendekatan

| Pendekatan | Dampak | Keputusan |
| --- | --- | --- |
| Perbaiki invariant pada helper dan endpoint yang ada | Cakupan terukur, kompatibel dengan patch saat ini, tes mengikuti alur nyata | Dipilih |
| Refactor seluruh domain stok/pembayaran | Perubahan jauh lebih luas daripada delapan temuan dan menambah risiko rilis | Ditunda |
| Tambalan UI dan retry saja | Tidak menyelesaikan jurnal, atomicity saldo, atau perhitungan kas | Tidak memenuhi kriteria selesai |

## Urutan dan cakupan

| Tahap | Temuan review | Hasil yang harus terbukti |
| --- | --- | --- |
| 1. Jurnal persetujuan | 3 | Semua jalur persetujuan menghasilkan bukti stok yang bisa dibalik |
| 2. Stok historis | 2 | Invoice legacy tanpa Surat Jalan bisa dibalik bila bukti cocok |
| 3. Saldo pelanggan | 4 | Checkout/approval/payment/reversal tidak saling mendahului atau tertinggal |
| 4. Kas bersih | 1 | Uang diterima dikurangi kembalian dengan pembagian metode yang benar |
| 5. Periode penerimaan | 8 | Penerimaan masuk berdasarkan tanggal ledger, terlepas tanggal invoice |
| 6. Metadata nota | 5 | Catatan layanan dan satuan bahan tetap ada setelah persetujuan |
| 7. Jumlah keranjang | 6 | Input UI hanya menerima jumlah yang bisa dibayar API |
| 8. Waktu invoice | 7 | Waktu tersinkron benar-benar dipakai untuk invoice tersimpan |
| 9. Pemeriksaan rilis | Semua | Regresi, concurrency, browser, dokumentasi, dan review ulang selesai |

## Tahap 1 — Jurnal stok pada seluruh jalur approval

**File utama:**

- Ubah apps/web/app/api/transactions/[id]/approve/route.ts.
- Gunakan apps/web/features/transactions-stock/helpers/transaction-stock-journal.ts dan helper log bahan di apps/web/features/pos-checkout/post-commit.ts.
- Tes apps/web/app/api/transactions/[id]/approve/__tests__/route.test.ts dan apps/web/features/transactions-stock/services/__tests__/transaction-reversal-service.test.ts.

**Kontrak:** buildTransactionStockJournal menerima transactionId, inventoryRows, stockMovements dari applyProductStockDeltas. Semua row yang dibuat harus membawa sourceTransactionRef, stockGroupIdSnapshot, unitMultiplierSnapshot, dan stockBaseDelta. Tanda delta harus sama dengan perubahan stok fisik.

- [ ] Tambah tes POST approval tanpa items/fingerprint; sesudah POST selesai, jurnal sudah tersimpan dalam tx, tanpa perlu memanggil callback after. Masukkan produk dan layanan berbahan baku dalam fixture.
- [ ] Tambah tes approval lalu VOID lalu DELETE: produk/bahan kembali ke saldo awal, pengembalian kedua tidak menambah stok, audit tersimpan.
- [ ] Jalankan tes dan pastikan kegagalan berasal dari jurnal yang hilang, bukan mock yang belum lengkap.
- [ ] Satukan pembangunan inventoryRows untuk jalur dengan quote dan tanpa quote. Untuk jalur tanpa quote, bentuk rows dari item tersimpan, termasuk bahan baku; gunakan stockMovements yang benar-benar dikembalikan writer.
- [ ] Simpan seluruh jurnal di transaksi database yang sama dengan perubahan status dan stok; hapus penulisan jurnal dalam after. Pertahankan kompatibilitas request tanpa quote.
- [ ] Pastikan status/sumber stok pada hasil approval sesuai jalur pengurangan aktual, termasuk draft/pending historis berlabel SURAT_JALAN; jangan mengurangi dua kali transaksi yang sudah final.
- [ ] Jalankan kedua file tes dan cek endpoint approve-draft serta offline-sync yang sudah memakai jurnal.

Contoh assertion untuk ditambahkan pada fixture route test yang ada:

```ts
expect(inventoryLogCreateManyMock).toHaveBeenCalledWith({
  data: expect.arrayContaining([
    expect.objectContaining({
      transactionId: "tx-1",
      sourceTransactionRef: "tx-1",
      type: "OUT",
      stockBaseDelta: expect.any(Number),
    }),
  ]),
});
```

**Selesai bila:** request approval lama dan baru sama-sama dapat di-void dengan pengembalian tepat sekali; kegagalan insert jurnal membatalkan status dan stok.

## Tahap 2 — Pengembalian invoice legacy tanpa Surat Jalan

**File utama:**

- Ubah apps/web/features/transactions-stock/services/transaction-reversal-service.ts.
- Tes apps/web/features/transactions-stock/services/__tests__/transaction-reversal-service.test.ts dan apps/web/app/api/transactions/[id]/__tests__/route.test.ts.
- Referensi baca-saja packages/db/prisma/migrations/20260823_transaction_stock_deduction_source/migration.sql.

**Kontrak:** gunakan log invoice legacy yang cocok persis berdasarkan produk, reason, note, jumlah dan scope toko. Jangan menganggap label SURAT_JALAN sendirian membuktikan ada pengiriman. Perbarui bukti legacy ke snapshot bertanda dalam transaksi reversal, agar pengulangan memakai jurnal yang sudah ditautkan.

- [ ] Tambah tes fixture legacy tanpa suratJalan, dengan stockDeductionSource SURAT_JALAN dan makeLegacyInvoiceLogs yang cocok.
- [ ] Jalankan dan pastikan tes gagal dengan konflik bukti stok seperti reproduksi review.
- [ ] Bedakan invoice-only legacy yang terbukti dari invoice yang punya riwayat pengiriman. Jalur invoice-only boleh memakai proveLegacyStockDeduction meskipun sumber hasil backfill adalah SURAT_JALAN.
- [ ] Pertahankan pemeriksaan exact quantity, log duplikat/ekstra, group history, conversion review, stock proof status dan raw material. Riwayat pengiriman parsial tetap memakai bukti shipment, bukan seluruh jumlah invoice.
- [ ] Tambah kasus log kosong, note tidak cocok, quantity berubah, produk telah masuk kelompok, invoice lama sudah void, dan VOID diulang lalu DELETE. Kasus ambigu tetap 409 tanpa write.
- [ ] Jalankan tes legacy dan endpoint reversal. Tidak mengubah migrasi lama atau melakukan bulk backfill label transaksi.

Tes awal menggunakan fixture yang sudah ada dalam file reversal test:

```ts
const tx = makeTx({
  current: { ...transaction, stockDeductionSource: "SURAT_JALAN", suratJalan: [] },
  inventoryLogs: makeLegacyInvoiceLogs(),
});
await expect(reverseTransaction(tx as never, {
  storeId: "store-1", transactionId: "tx-1", action: "VOID",
  actor: { id: "owner-1", name: "Owner One", role: "OWNER" },
})).resolves.toBe("APPLIED");
```

**Selesai bila:** skenario review legacy invoice-only lulus dan skenario legacy yang tidak terbukti tetap ditolak.

## Tahap 3 — Saldo pelanggan atomik dan concurrency

**File utama:**

- Ubah apps/web/app/api/transactions/route.ts, apps/web/app/api/transactions/[id]/approve/route.ts, apps/web/app/api/transactions/[id]/approve-draft/route.ts.
- Periksa apps/web/app/api/offline-sync/transactions/route.ts, apps/web/app/api/transactions/[id]/pay-debt/route.ts, apps/web/app/api/customers/[id]/pay-debt/route.ts.
- Ubah bila perlu apps/web/features/pos-checkout/post-commit.ts dan apps/web/features/transactions-stock/services/transaction-reversal-service.ts.
- Tes route masing-masing dan reversal-service.test.ts; buat apps/web/features/transactions-stock/services/__tests__/transaction-lifecycle-concurrency.integration.test.ts untuk dua koneksi PostgreSQL.

**Kontrak:** setiap penjualan aktif berkontribusi totalOrders +1, totalSpent sebesar penerimaan bersih, dan totalDebt sebesar sisa DP/Tempo. Semua kontribusi ikut commit/rollback transaksi induk. after hanya berisi notifikasi atau kerja yang tidak menentukan saldo.

- [ ] Buat tes route yang memeriksa saldo benar saat respons sukses, tanpa menjalankan after. Buat tes kegagalan update customer menyebabkan rollback pembuatan/approval.
- [ ] Buat tes create/approve lalu segera VOID; tidak ada update customer tertunda setelah void. Sertakan Tempo awal nol, parsial, DP, bayar lunas dengan kembalian, serta guest tanpa customerId.
- [ ] Pindahkan totalOrders/totalSpent/totalDebt ke tx. Gabungkan increment Tempo yang sudah ada dengan helper customer agar piutang tidak bertambah dua kali. TotalSpent gunakan net collection yang sama dengan tahap 4.
- [ ] Inventarisasi urutan lock checkout, approval, reversal, bayar per transaksi dan bayar per pelanggan. Tetapkan urutan konsisten: row pelanggan bila ada, lalu transaksi secara urut id, lalu row stok melalui writer yang sudah ada. Jangan memakai lock urutan terbalik di salah satu endpoint.
- [ ] Di reversal, reload status, amountPaid, customerId dan jurnal setelah lock. Guard saldo tidak boleh bergantung pada callback asynchronous; konflik saldo historis tetap dibedakan dari race transaksi baru.
- [ ] Buat audit saldo historis baca-saja: bandingkan customer aggregate dengan transaksi/payment ledger yang terbukti; laporkan perbedaan. Jangan otomatis menimpa saldo historis atau guest-name mapping yang ambigu.
- [ ] Jalankan integrasi dua koneksi: approve vs void, void vs delete, payment vs void, customer allocation vs transaction payment. Gunakan barrier/latch agar operasi overlap, bukan tes serial yang tampak seperti race.

Invariant tes saldo setelah operasi berurutan:

```ts
expect(customerAfterSale).toMatchObject({ totalOrders: 1, totalSpent: 25_000, totalDebt: 75_000 });
expect(customerAfterVoid).toMatchObject({ totalOrders: 0, totalSpent: 0, totalDebt: 0 });
expect(customerAfterRepeatedVoid).toEqual(customerAfterVoid);
```

Pada tes integration, customerAfterSale/customerAfterVoid/customerAfterRepeatedVoid berasal dari query customer untuk fixture yang baru dibuat. Catat baseline bila fixture tidak dimulai dari nol.

**Selesai bila:** transaksi baru dapat segera dibalik; race tidak meninggalkan stok/saldo setengah berubah, piutang negatif atau update after yang terlambat.

## Tahap 4 — Penerimaan bersih setelah kembalian

**File utama:**

- Buat apps/web/features/customer-debt/helpers/net-initial-payments.ts dan __tests__/net-initial-payments.test.ts.
- Ubah apps/web/features/financial-report/helpers/report-core.ts dan apps/web/app/api/finance/report/route.ts.
- Gunakan helper yang sama pada penambahan totalSpent tahap 3. Periksa invoice/receipt payment presentation supaya perhitungan konsisten.
- Tes financial-report/helpers/__tests__/report-core.test.ts serta app/api/finance/report/__tests__/route.test.ts.

**Interface yang dibuat:**

```ts
type InitialPayment = { method: string; amount: number };
export function netInitialPayments(input: {
  payments: readonly InitialPayment[];
  total: number;
  amountPaid: number;
  change: number;
}): InitialPayment[];
```

- [ ] Tambah tes belanja 100.000, CASH 150.000, change 50.000: summary.collected dan CASH.collected harus 100.000.
- [ ] Tambah tes CASH 70.000 + TRANSFER 50.000, total 100.000, change 20.000: CASH bersih 50.000 dan TRANSFER 50.000. Tempo awal nol/parsial tidak menghasilkan metode TEMPO dalam kas.
- [ ] Jalankan tes dan konfirmasi hasil awal 150.000, bukan 100.000.
- [ ] Normalisasi ledger ke cents, hindari nilai negatif, dan kurangi kembalian dari CASH terlebih dahulu. Untuk data lama yang mengizinkan overpayment tanpa CASH, kurangi sisa dari metode pembayaran terbesar secara deterministik dan batasi jumlah net awal ke min(amountPaid, total).
- [ ] Tambahkan change pada query report. Jangan memasukkan pelunasan piutang ke helper initial payment atau menghitungnya dua kali.
- [ ] Gunakan net initial sum untuk kontribusi totalSpent checkout/approval; pelunasan tetap menambah totalSpent sebesar uang yang dibayar, reversal mengurangi kontribusi bersih kumulatif.
- [ ] Jalankan helper, report dan customer analytics tes.

Contoh tes helper:

```ts
expect(netInitialPayments({
  payments: [{ method: "CASH", amount: 150_000 }],
  total: 100_000, amountPaid: 150_000, change: 50_000,
})).toEqual([{ method: "CASH", amount: 100_000 }]);
```

**Selesai bila:** kas tidak bertambah sebesar uang yang dikembalikan dan pembagian metode cocok dengan total penerimaan bersih.

## Tahap 5 — Ledger penerimaan independen dari tanggal invoice

**File utama:** apps/web/app/api/finance/report/route.ts, apps/web/features/financial-report/helpers/report-core.ts dan kedua file tes yang sama pada tahap 4.

**Kontrak:** pendapatan/HPP/jumlah invoice memakai invoiceDate. Penerimaan kas memakai transactionPayment.createdAt dan debtPaymentLog.createdAt. Initial payment dan debt payment adalah event berbeda, masing-masing dihitung satu kali. Status VOIDED/REFUNDED mengikuti kebijakan pengecualian aktif yang sudah ada; jangan mengubah kebijakan refund historis pada patch ini.

- [ ] Tambah fixture invoiceDate 5 Oktober dan pembayaran awal 6 Oktober: laporan tanggal 5 memiliki revenue tanpa collected; laporan tanggal 6 memiliki collected tanpa revenue invoice tersebut.
- [ ] Tambah kasus invoice tanggal depan, approval pada hari lain, metode split, DP/Tempo dilunasi pada hari lain, dan rentang yang memuat kedua hari. Jumlah kas lintas hari harus tetap sama.
- [ ] Jalankan dan konfirmasi query invoice saat ini menghilangkan event pembayaran pada tanggal 6.
- [ ] Query initial payment events secara terpisah berdasarkan createdAt dengan filter storeId dan parent status. Ambil payment metadata seluruh pembayaran awal milik parent yang relevan agar alokasi change tetap benar, meskipun hanya sebagian event berada dalam rentang.
- [ ] Pertahankan query debt payments berdasarkan createdAt. Jangan membatasi event penerimaan ke daftar id invoice dalam rentang.
- [ ] Dalam buildFinancialReport, proses revenue dan collection dalam loop terpisah. Initial event membawa transactionId, method, net amount, createdAt dan identitas sales; event dari invoice di luar rentang tetap menambah collected/metode/sales pada rentang uang diterima.
- [ ] Legacy tanpa ledger hanya memakai fallback yang jelas dan terdokumentasi. Jangan menciptakan tanggal penerimaan baru dari amountPaid yang telah berisi pelunasan; data legacy ambigu tidak dijumlahkan sebagai event baru.
- [ ] Verifikasi API, summary, payment breakdown, dan salesperson collected. Tes range harian memakai batas WIB.

Assertion lintas periode pada dua hasil report fixture yang sama:

```ts
expect(reportOct5.summary).toMatchObject({ revenue: 100_000, collected: 0 });
expect(reportOct6.summary).toMatchObject({ revenue: 0, collected: 100_000 });
expect(reportOct5to6.summary).toMatchObject({ revenue: 100_000, collected: 100_000 });
```

**Selesai bila:** uang awal dan pelunasan tercatat di hari ledger yang benar, walaupun tanggal invoice berbeda.

## Tahap 6 — Pertahankan metadata item saat approval

**File utama:**

- Ubah apps/web/features/transactions-draft/services/approval-quote.ts.
- Ubah apps/web/app/(main)/history/components/ApproveModal.tsx dan TransactionCartEditor.tsx.
- Ubah apps/web/features/transactions-draft/components/ApproveDraftDialog.tsx dan types/draft.ts.
- Ubah schema/persist pada approval-quote, approve, dan approve-draft route.
- Tes approval-quote.test.ts, kedua approval route test, ApproveModal.test.tsx dan ApproveDraftDialog.test.tsx.

**Interface:** tambahkan serviceNote?: string | null pada ApprovalItemInput dan CartEditorItem. Dapatkan rawMaterialUnit dari katalog bahan yang divalidasi server dan bawa pada quoted item untuk persist. Catatan harus masuk fingerprint agar perubahan setelah quote membutuhkan review ulang.

- [ ] Tambah fixture layanan dengan serviceNote “Laminasi doff”, rawMaterialUnit “lembar”; approval tanpa edit harus mempertahankan keduanya.
- [ ] Jalankan tes dan konfirmasi field menjadi null/hilang karena item diganti.
- [ ] Bawa serviceNote melalui mapper UI, request schema, normalizeItem, quote dan items.create. Unit bahan diisi dari bahan yang dipilih di server, bukan teks arbitrary klien.
- [ ] Persist catatan pada item yang tetap ada; item yang dihapus tidak muncul kembali. Bahan yang diganti mendapat unit baru yang benar.
- [ ] Tes dua baris layanan yang sama dengan catatan berbeda tidak kehilangan identitas/catatan. Tes request lama yang tidak membawa field baru mempertahankan metadata item existing yang dapat dicocokkan tanpa ambiguitas; jangan menggabungkan dua baris berdasarkan productId saja.
- [ ] Jalankan tes quote, UI dan route; inspeksi detail nota setelah approval.

Contoh assertion items.create pada fixture route test:

```ts
expect(savedServiceItem).toMatchObject({
  serviceNote: "Laminasi doff",
  rawMaterialUnit: "lembar",
  rawMaterialQuantity: 2.5,
});
```

savedServiceItem diambil dari payload items.create atau query transactionItem sesudah approval; quantity bahan desimal tetap valid.

**Selesai bila:** approval tidak menghilangkan catatan layanan atau unit bahan dan metadata baru dilindungi fingerprint.

## Tahap 7 — Selaraskan jumlah UI dan API

**File utama:** apps/web/features/pos-checkout/helpers/cart-quantity.ts, components/CartQuantityInput.tsx, helpers/__tests__/cart-quantity.test.ts, __tests__/CartSidebar.test.tsx, serta __tests__/cart-quick-edit-state.test.tsx.

**Kontrak:** parseCartQuantity tetap return number | null; hanya menerima safe integer positif. Tidak memperluas schema quantity transaksi menjadi desimal.

- [ ] Ubah tes decimal yang sekarang diterima menjadi ditolak; tambahkan whitespace, nol, negatif, string parsial, exponent, angka tidak aman, dan integer valid.
- [ ] Jalankan dan konfirmasi parser menerima 2,5 sebelum perbaikan.
- [ ] Validasi Number.isSafeInteger(value) && value > 0. Input gunakan inputMode numeric; pesan “Masukkan jumlah bulat lebih dari nol.”
- [ ] Tetap simpan draft ketika mengetik, blokir bayar saat invalid, dan pulihkan jumlah terakhir yang valid saat blur/Escape. +/- dan perubahan unit tetap memakai jumlah bulat.
- [ ] Tes input 12, hapus sementara, 2,5, blur, Enter, Escape, ganti unit sambil mempertahankan angka 2. Jangan mengubah parser jumlah bahan baku.
- [ ] Jalankan parser/UI tes dan browser cart sampai checkout API menerima quantity.

```ts
expect(parseCartQuantity("2,5")).toBeNull();
expect(parseCartQuantity("2.5")).toBeNull();
expect(parseCartQuantity(" 12 ")).toBe(12);
expect(parseCartQuantity("9007199254740992")).toBeNull();
```

**Selesai bila:** pengguna tidak bisa melanjutkan pembayaran dengan quantity yang pasti ditolak API.

## Tahap 8 — Gunakan clock Internet pada invoice tersimpan

**File utama:**

- Buat apps/web/features/invoice-date/services/internet-clock.ts dan services/__tests__/internet-clock.test.ts.
- Pindahkan state/cache/fetch dari apps/web/app/api/time/route.ts ke layanan tersebut, tanpa mengubah kontrak respons publik.
- Gunakan pada apps/web/app/api/transactions/route.ts, draft/route.ts, dan [id]/approve-draft/route.ts.
- Periksa [id]/approve/route.ts agar tanggal yang sudah disepakati tidak berubah diam-diam.
- Tes time endpoint, create/draft/approve-draft route, server-clock helper dan PaymentModal.

**Interface layanan:**

```ts
export interface InternetClockReading {
  serverEpochMs: number;
  source: "TIMEAPI_IO" | "TIMEAPI_IO_CACHE" | "TIMEAPI_IO_STALE" | "SERVER_FALLBACK";
  lastSyncedAt: number | null;
}
export async function getClockReading(): Promise<InternetClockReading>;
```

- [ ] Buat tes jam mesin 1 Oktober, provider 6 Oktober 2026 08.30 WIB; invoiceDate dan prefix nomor dokumen default harus memakai 6 Oktober.
- [ ] Jalankan tes dan pastikan implementasi saat ini memakai jam mesin.
- [ ] Pindahkan penyedia jam ke layanan server, pertahankan timeout 2 detik, cache 60 detik, latency adjustment, stale/fallback, dan tambahkan single-flight untuk fetch concurrent. Jangan melakukan network fetch saat row lock sudah dipegang.
- [ ] Ambil now dari getClockReading sebelum transaksi database. Gunakan now yang sama untuk tanggal default, prefix invoice, dan validasi alasan beda hari; createdAt database tetap timestamp pencatatan database.
- [ ] Manual invoiceDate/invoiceTime Owner/Admin tetap dipertahankan. Approval pending dengan invoiceDate tersimpan mempertahankan tanggalnya; draft yang baru menjadi invoice memperoleh default dari layanan clock.
- [ ] Endpoint /api/time memakai layanan yang sama. Jangan mempercayai epoch klien sebagai tanggal otoritatif, dan jangan mengizinkan role tanpa izin mengatur tanggal melalui payload default.
- [ ] Tes UTC→WIB saat lewat tengah malam, cache, provider timeout, stale/fallback, custom date, role denial dan request concurrent. Mock jaringan pada unit test; live test satu permintaan mengonfirmasi source aktual atau fallback yang jujur.

Assertion route dengan clock service mock:

```ts
expect(createdInvoice.invoiceDate.toISOString()).toBe("2026-10-06T01:30:00.000Z");
expect(createdInvoice.invoiceNumber).toMatch(/^INV-20261006-/);
```

createdInvoice diambil dari payload transaction.create pada mock route, dengan providerEpochMs tetap pada 2026-10-06T01:30:00.000Z.

**Selesai bila:** waktu default tersimpan mengikuti sumber server tersinkron dan label UI memakai sumber yang sama.

## Tahap 9 — Validasi keseluruhan dan dokumentasi

- [ ] Jalankan seluruh tes terkait setiap tahap; hanya lanjut ketika failure baseline terpecahkan dan tidak ada regression baru.
- [ ] Jalankan suite web satu kali setelah seluruh perubahan final, serta type-check langsung per paket yang terdampak. Jangan mengklaim tes concurrency berdasarkan mock saja.
- [ ] Jalankan git diff --check dan GitNexus detect-changes --scope all; bandingkan daftar simbol/proses dengan file dalam rencana. Sebelum commit yang nanti diminta pengguna, jalankan detect_changes lagi.
- [ ] Jika perubahan schema ternyata diperlukan, gunakan migrasi baru; uji terhadap database/schema sementara dan catat migrasi yang diterapkan. Rencana saat ini tidak membutuhkan schema migration baru.
- [ ] Live test menggunakan server dev yang dikelola pengguna. Jika API masih timeout seperti QA sebelumnya, telusuri log/server connectivity melalui systematic-debugging; jangan menandai skenario sebagai lulus atau menebak penyebab.
- [ ] Uji Owner: buat final CASH dengan kembalian, Tempo awal nol/parsial, pending/draft berisi layanan dan bahan, edit item approval, bayar piutang, void, void ulang, delete sesudah void. Uji default RBAC non-Owner dan override konfigurasi menggunakan fixture yang jelas.
- [ ] Untuk setiap fixture bisnis baru, rekam saldo stok/baseStock dan customer baseline sebelum/sesudah; cleanup hanya data fixture milik tes. Data legacy bisnis yang ada cukup diperiksa baca-saja; reproduksi legacy memakai fixture.
- [ ] Uji laporan tanggal invoice berbeda dari pembayaran dan total rentang gabungan. Uji jumlah dan unit di desktop/mobile serta keyboard.
- [ ] Perbarui markdown-files/patch-besar-pos-implementation-status-2026-10-06.md, HelpContent.tsx dan workflow-catalog.ts untuk aturan jumlah, waktu tersimpan, kas bersih, periode penerimaan, metadata nota dan pengembalian stok yang relevan.
- [ ] Review ulang delapan temuan, tandai masing-masing dengan tes bukti dan hasil browser/integration. Laporan akhir memisahkan lulus, belum diuji, dan hambatan lingkungan.
- [ ] Panggil Headroom stats di akhir bila MCP tersedia; jika tidak, catat keterbatasannya. Tidak commit, push atau deploy otomatis.

### Perintah validasi yang aman

Jalankan dari C:\Projects\pos-system-monorepo, dengan path berkurung dan [id] tetap di dalam tanda kutip:

```powershell
pnpm --filter @pos/web exec vitest run features/transactions-stock "app/api/transactions/[id]/approve/__tests__/route.test.ts" "app/api/transactions/[id]/approve-draft/__tests__/route.test.ts"
pnpm --filter @pos/web exec vitest run features/financial-report/helpers/__tests__/report-core.test.ts app/api/finance/report/__tests__/route.test.ts
pnpm --filter @pos/web exec vitest run features/pos-checkout/helpers/__tests__/cart-quantity.test.ts features/invoice-date app/api/time
pnpm --filter @pos/web exec vitest run
pnpm --filter @pos/web exec tsc --noEmit --incremental false
pnpm --filter @pos/db exec tsc --noEmit --incremental false
git diff --check
node .gitnexus/run.cjs detect-changes -r pos-system-monorepo --scope all --limit 30
```

Tes PostgreSQL khusus tahap 3 dijalankan tersendiri setelah database/schema fixture terkonfigurasi; suite normal harus skip integrasi dengan alasan jelas bila konfigurasi itu belum ada, bukan menyentuh database default tanpa sengaja.

## Kriteria rilis

Seluruh delapan temuan mempunyai tes regresi yang dahulu gagal lalu lulus. Jurnal/status/stok/saldo/pembayaran tetap atomik, repeat void/delete tidak menggandakan pengembalian, dan dua sesi PostgreSQL memverifikasi race utama. Kas bersih cocok lintas metode dan hari pembayaran. Metadata cetak dipertahankan, jumlah invalid terblokir, dan tanggal default tersimpan memakai layanan clock tersinkron. Hasil unit, integration, browser dan dokumentasi telah direview; hambatan live API tidak dianggap sebagai kelulusan.
