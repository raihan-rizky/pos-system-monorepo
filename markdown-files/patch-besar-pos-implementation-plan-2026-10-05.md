# Patch Besar POS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menerapkan seluruh fitur pada spesifikasi patch POS yang disetujui, kemudian merilisnya bersama.
**Architecture:** Pertahankan model pengadaan dan layanan stok existing. Pisahkan aturan harga, mutasi keranjang, piutang, dan waktu sebagai helper teruji; gunakan transaksi database untuk persetujuan dan pembalikan stok.
**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma 6/PostgreSQL, TanStack Query, Dexie, Vitest, Playwright, pnpm.

## Global Constraints

- Satu rilis besar setelah seluruh tahap selesai dan lolos validasi.
- Default Owner; dapat diberikan kepada peran lain melalui RBAC.
- Pembaruan otomatis modal master ditunda dari patch ini.
- Pertahankan UMUM, AGEN, INDUSTRI, PEMERINTAH.
- 2 Dus → 2 Bal; pergantian satuan mempertahankan angka jumlah.
- Jakarta WIB: `Asia/Jakarta`, timestamp database UTC.
- Jangan menjalankan `pnpm build`; server lifecycle tetap dikelola pengguna.
- TDD berlaku: tes harus gagal karena perilaku yang belum benar sebelum implementasi.
- Gunakan systematic-debugging untuk kegagalan atau perilaku tak terduga.
- Sebelum edit simbol, jalankan GitNexus impact upstream dan laporkan callers, proses, serta risk. HIGH/CRITICAL wajib diberitahukan sebelum edit.
- Sebelum commit, jalankan GitNexus detect-changes staged, periksa diff, dan stage hanya file tugas. Hasil kosong dari index rusak bukan bukti aman.
- Jangan timpa override RBAC tersimpan, harga historis, timestamp manual, atau kontrak stok SURAT_JALAN lama.
- Bahasa UI Indonesia. Perbarui Bantuan dan AI workflow yang berubah sebelum rilis.
- Lokasi dokumen: `C:\Projects\pos-system-monorepo\markdown-files`; nama berakhiran `2026-10-05.md`.
- Jalankan migrasi hanya pada database pengujian terisolasi ketika memverifikasi. Rencana ini tidak memberikan izin deploy/migrasi produksi.
- Tidak menambah dependency; browser test memakai Playwright existing dan `PLAYWRIGHT_SKIP_WEBSERVER=1` terhadap server pengujian yang disediakan pengguna.

## Cara menjalankan setiap tugas

Semua path relatif terhadap `C:\Projects\pos-system-monorepo`. Kode tes dan kode implementasi di bawah adalah isi yang harus ditambahkan saat eksekusi, bukan kode yang sudah dijalankan. Tes helper perlu dilengkapi assertion integrasi yang disebutkan pada tugas; keberhasilan helper saja tidak membuktikan handler/UI sudah memakai perilaku baru.

Setiap tugas: analisis impact → tulis tes → jalankan dan pastikan RED → implementasi → jalankan GREEN serta type-check → detect-changes → review diff → commit. Perintah commit hanya dijalankan setelah file pada **Files** diperiksa. Gunakan skill using-git-worktrees saat memulai eksekusi, dan baca instruksi AGENTS pada checkout tujuan.

---


**Spesifikasi disetujui:** [patch-besar-pos-design-2026-10-05.md](C:/Projects/pos-system-monorepo/markdown-files/patch-besar-pos-design-2026-10-05.md)

**Status per 2026-10-06:** Implementasi kode dan dokumentasi selesai di workspace. TypeScript, validasi schema Prisma, dan suite web lengkap lulus; hasil serta batas verifikasi rinci ada di [status implementasi](C:/Projects/pos-system-monorepo/markdown-files/patch-besar-pos-implementation-status-2026-10-06.md). Checklist di bawah tetap menjadi gerbang rilis untuk pemeriksaan database terisolasi, browser/data toko aktual, dan langkah integrasi yang belum diverifikasi. Fitur tetap ditujukan untuk satu rilis bersama; belum diterapkan ke database atau dirilis.

## Bagian dan urutan eksekusi

1. [Pengadaan dan Penerimaan Implementation Plan](C:/Projects/pos-system-monorepo/markdown-files/patch-pos-01-pengadaan-plan-2026-10-05.md) — P1, P2, P3, P4, P5.
2. [Harga, Keranjang dan Persetujuan Implementation Plan](C:/Projects/pos-system-monorepo/markdown-files/patch-pos-02-harga-cart-approval-plan-2026-10-05.md) — C1, C2, C3, C4, C5.
3. [Tempo, Piutang dan Nota Implementation Plan](C:/Projects/pos-system-monorepo/markdown-files/patch-pos-03-tempo-plan-2026-10-05.md) — T1, T2, T3.
4. [Siklus Stok dan Void/Hapus Implementation Plan](C:/Projects/pos-system-monorepo/markdown-files/patch-pos-04-stok-plan-2026-10-05.md) — S1, S2, S3.
5. [Waktu WIB, Dashboard dan Rilis Implementation Plan](C:/Projects/pos-system-monorepo/markdown-files/patch-pos-05-waktu-dashboard-rilis-plan-2026-10-05.md) — D1, D2, D3.

Urutan yang menghormati dependensi: **P1–P5 → C1–C4 → S1–S2 → C5 → T1–T3 → S3 → D1–D3**. S1–S2 menjadi fondasi persetujuan atomik; D1/D2 dapat dikerjakan setelah kontrak stabil. Tetap satu rilis besar sesudah semua hasil terintegrasi.

## Preflight eksekusi

- [ ] Baca AGENTS dan skill executing-plans, TDD, systematic-debugging, lint-and-validate. Gunakan using-git-worktrees saat mulai implementasi, periksa/reuse attachment worktree yang sesuai.
- [ ] Tidak ada delegasi sebelum pengguna memilih kerja dengan subagent. Skill/header menyebut opsi; rencana ini belum menjalankan agen lain.
- [x] Untuk pekerjaan UI, modern-web-guidance dicari lebih dahulu; pengguna memilih antislop selama pengerjaan. Gunakan mode DURING dan audit delivery gate.
- [ ] GitNexus: periksa status/doctor dan pulihkan index dengan runner project. Hindari menghapus index atau mematikan proses milik pengguna tanpa alasan yang terverifikasi. Sebelumnya rebuild Windows gagal dan query kosong, sehingga callers/risk belum terverifikasi.

```powershell
gitnexus status
gitnexus doctor
node .gitnexus/run.cjs analyze --index-only
gitnexus context priceProductForCustomerType --repo pos-system-monorepo
gitnexus impact priceProductForCustomerType --direction upstream --repo pos-system-monorepo
```

- [ ] Pastikan index mengembalikan simbol aktual dan callers yang cocok dengan source. Jika kegagalan yang sama berulang, laporkan detail dan kebutuhan pemulihan; jangan melanjutkan edit simbol dengan graph rusak.
- [ ] Dapatkan target DB pengujian terisolasi melalui POS_TEST_DATABASE_URL. Jangan memakai DATABASE_URL/DIRECT_URL proyek sebagai fallback. Pastikan URL menunjuk database akhiran _test atau schema pos_patch_test yang disediakan untuk tugas ini. Tidak mencetak kredensial.
- [ ] Gunakan server pengujian yang disediakan pengguna untuk browser/E2E; PLAYWRIGHT_SKIP_WEBSERVER=1. Fixture UI mocked membuktikan interaksi, bukan concurrency database.
- [ ] Sediakan fixture penerimaan parsial, Dus/Bal (multiplier1/5), jasa cetak dengan bahan baku, pelanggan Tempo, serta invoice legacy surat jalan untuk pengujian.

## Data dan migrasi

| Urutan | Migrasi | Isi |
| --- | --- | --- |
| 1 | 202610050001_shopping_request_name | Nama + normalizedName, backfill nomor, unique per toko |
| 2 | 202610050002_receipt_supplier_cost | Harga modal penerimaan nullable; legacy tidak diisi dari master baru |
| 3 | 202610050003_payment_method_tempo | Enum TEMPO, tanpa mengubah DP/CREDIT historis |
| 4 | 202610050004_transaction_stock_audit | Snapshot mutasi stok, audit yang bertahan setelah delete, FK nullable terkait |
| 5 | 202610050005_category_sales_group | Mapping kategori laporan tanpa mengganti kategori inventory |

Nama urutan migrasi tetap konsisten meskipun S1 dikerjakan sebelum T1. Terapkan seluruh migration set pada DB test sebelum rangkaian integrasi. SQL/schema dirancang pada tiap task; tidak menjalankan migrate produksi selama implementasi interaktif.

Perintah migrasi khusus DB test (jalankan hanya setelah target tersedia dan diverifikasi):

```powershell
if (-not $env:POS_TEST_DATABASE_URL) { throw 'DB pengujian terisolasi belum tersedia.' }
$patchTestUri = [Uri]$env:POS_TEST_DATABASE_URL
$patchSchemaValues = @(foreach ($patchQueryPair in $patchTestUri.Query.TrimStart('?').Split('&')) {
  $patchQueryParts = $patchQueryPair -split '=', 2
  if ([Uri]::UnescapeDataString($patchQueryParts[0]) -ceq 'schema') {
    if ($patchQueryParts.Length -eq 2) { [Uri]::UnescapeDataString($patchQueryParts[1]) }
  }
})
$patchHasSafeSchema = $patchSchemaValues.Count -eq 1 -and $patchSchemaValues[0] -ceq 'pos_patch_test'
if (-not ($patchTestUri.AbsolutePath.EndsWith('_test') -or $patchHasSafeSchema)) { throw 'Target harus DB _test atau schema pos_patch_test.' }
$patchPreviousDatabaseUrl = $env:DATABASE_URL
$patchPreviousDirectUrl = $env:DIRECT_URL
try {
  $env:DATABASE_URL = $env:POS_TEST_DATABASE_URL
  $env:DIRECT_URL = $env:POS_TEST_DATABASE_URL
  pnpm --filter @pos/db exec prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw 'Migrasi DB pengujian gagal.' }
  pnpm --filter @pos/db exec prisma generate
  if ($LASTEXITCODE -ne 0) { throw 'Generate Prisma client gagal.' }
} finally {
  $env:DATABASE_URL = $patchPreviousDatabaseUrl
  $env:DIRECT_URL = $patchPreviousDirectUrl
}
```

## Cakupan spesifikasi ke task

| Kebutuhan | Task |
| --- | --- |
| Nama default nomor dan custom unik | P1 |
| Integrasi belanja/pembelian/penerimaan Supplier | P2 |
| Default RBAC Gudang/Owner penerimaan, Owner/Admin approval | P2 |
| Hapus default Owner, configurable melalui RBAC | P2 + S3 |
| Modal penerimaan default current master; auto-update master ditunda | P3 |
| Kunci/Selesai menutup popup pada sukses | P4 |
| Dua nota A4, ringkas tiga kolom dan lengkap | P5 |
| Harga khusus utama dan tanpa selector prioritas | C1 |
| Satuan kecil kiri/besar kanan | C2 |
| Pilihan unit dari cart, harga mengikuti, jumlah tetap | C3 |
| Input jumlah langsung | C4 |
| Tambah/kurangi/hapus item persetujuan + semua referensi harga | C5 |
| Empat tipe pelanggan dipertahankan | C1/C5/T1 tidak mengubah CustomerType |
| Tempo terpisah DP, badge, piutang dan pelunasan | T1–T3 |
| Stok final saat create, pending saat approve | S1–S2 + C5 |
| Void/delete restore sekali termasuk bahan baku | S1–S3 |
| Transaksi lama surat jalan/parsial | S2–S3 |
| Waktu server tersinkronisasi dan Jakarta WIB | D1 |
| Produk terlaris per ATK/Kertas/Cartridge/Tinta | D2 |
| Bantuan, AI workflow, dokumentasi dan validasi akhir | D3 |

## Kontrak antarbagian yang tidak boleh berubah diam-diam

1. Pricing C1 tetap menerima payload legacy preference tetapi selalu memilih special/member/regular. C3 mengganti identitas unit dan membersihkan manual price source; C5 memvalidasi harga di server.
2. S2 dipanggil dalam transaksi Prisma caller. C5 menulis item + total + persetujuan dalam transaksi yang sama; T1 memasukkan piutang aktif di sana.
3. T2 tidak memanggil mutasi stok saat pelunasan. S3 membalik kontribusi piutang aktif saat void/delete tanpa menjadikan Tempo sebagai DP.
4. P3 menyimpan biaya per penerimaan dan memakai biaya tersebut pada stok masuk, tanpa otomatis mengubah modal produk/pengeluaran pembelian.
5. D1 membedakan default server, manual audited, serta original offline createdAt; timestamp offline tidak diganti waktu unggah.
6. P2 memperbarui default dan resource baru, tetapi semua row permission persisted adalah override authoritative. Tidak mencoba menebak row yang pernah berasal dari default lama.
7. Stock proof untuk history tidak lengkap memunculkan konflik yang bisa ditelusuri; tidak menambah stok dengan perkiraan berdasarkan kuantitas invoice.

## Validasi akhir

Baseline sebelumnya: 383 file tes web lulus, satu file dilewati; 2.047 tes lulus, empat dilewati. Enam tes helper stok dan empat tes offline tambahan lulus. Type-check lima package lulus. Angka ini baseline sebelum patch, bukan target yang membuktikan fitur selesai.

- [ ] Tiap task memiliki hasil RED dan GREEN yang dicatat, bukan hanya hasil akhir.
- [ ] Migrasi diuji dari data lama dan pada DB kosong; nama bentrok, enum, nullable history, dan FK saat delete diverifikasi.
- [ ] Default serta persisted grant/deny RBAC diverifikasi melalui API dan UI.
- [ ] Quote/approval server menolak manipulasi harga, cross-store item, perubahan harga sejak review, dan persetujuan bersamaan.
- [ ] Unit change + direct quantity berjalan pada desktop/mobile, reload, pagination katalog, dan offline cache.
- [ ] Pending/draft delete tidak menambah stok; final/material restore benar; void lalu delete tidak menggandakan stok.
- [ ] S3 real DB race suite lulus: dua void, dua delete, void/delete, concurrent approval/edit/delivery; rollback menjaga stock/status/debt/audit.
- [ ] Legacy partial Surat Jalan memulihkan actual remaining deduction; unknown proof ditolak tanpa perubahan sebagian.
- [ ] Tempo nol/partial/full, badge, piutang, kas periode pembayaran, receipt/PDF diperiksa.
- [ ] Dua A4 pendek dan long-list print/PDF diperiksa visual; semua item tercetak dan full version mulai halaman baru.
- [ ] Waktu WIB diuji pada zona perangkat berbeda; akses HTTPS ke TimeAPI.io dan status fallback saat penyedia tidak tersedia diverifikasi di deployment target.
- [ ] Mapping kategori database aktual ditinjau; Bot/Plano/Toner ditetapkan berdasarkan makna bisnis. Unknown tetap Lainnya.
- [ ] Semua panduan Bantuan/AI workflow selaras dengan UI dan permission efektif.
- [ ] Full suite dan type-check langsung berjalan tanpa build:

```powershell
pnpm --filter @pos/web test --reporter=dot
pnpm --filter @pos/web exec tsc --noEmit --incremental false
pnpm --filter @pos/db exec tsc --noEmit --incremental false
pnpm --filter @pos/ui exec tsc --noEmit --incremental false
pnpm --filter @pos/admin exec tsc --noEmit --incremental false
pnpm --filter @pos/product-import-worker exec tsc --noEmit --incremental false
pnpm --filter @pos/web exec vitest run --config vitest.stock-db.config.ts
pnpm --filter @pos/db exec tsx --test ../../apps/web/lib/offline/offline-sync-core.test.ts
```

Vitest bawaan tidak menemukan components/__tests__/stock-action-text.test.ts. Jika helper ini terdampak, jalankan dengan konfigurasi test sementara yang menambahkan include file tersebut; jangan diam-diam menghilangkan cek karena path tidak cocok. Langkah per-task/type-check menjalankan command satu per satu dan berhenti saat gagal.

```powershell
$env:PLAYWRIGHT_SKIP_WEBSERVER = '1'
pnpm --filter @pos/web exec playwright test e2e/pos-unit-cart.spec.ts e2e/pos.spec.ts e2e/draft-invoice.spec.ts e2e/history.spec.ts e2e/suppliers-goods-receipt.spec.ts e2e/financial-report.spec.ts --project=chromium
```

Pastikan server target memakai test fixtures/auth yang sesuai dan tidak merupakan checkout produksi. UI mock bukan bukti stock persistence. Jika lingkungan tidak tersedia, laporkan pemeriksaan tersebut belum dijalankan dan jangan tandai rilis siap.

- [ ] GitNexus detect-changes compare main dan staged scope cocok dengan task; diff tidak menyertakan env/index/artefak.
- [ ] Dokumentasi rilis berisi hasil aktual, skip reason, data mapping, risiko history, migration order, dan rollback. Pembatalan deploy tidak menghapus enum TEMPO atau transaksi Tempo yang sudah ada.
- [ ] User menerima hasil review dan mengizinkan deployment. Deployment/migrasi produksi adalah langkah akhir terpisah sesudah hasil konkret siap review.

## Batas pekerjaan saat menyusun rencana

Dokumen ini tidak menjalankan tes baru, mutasi DB, dev server, build, subagent, atau deploy. Index GitNexus, target DB terisolasi, server browser test, mapping kategori nyata, dan akses waktu daring pada host deployment adalah prasyarat eksekusi/validasi yang belum dibuktikan oleh penulisan rencana.
