# Implementasi HPP dan Harga Otomatis Grup Satuan

Tanggal: 2026-10-24, Asia/Jakarta (WIB).
Status: implementasi, tinjauan akhir dan integrasi selesai. Migrasi schema dev dan prod sudah diterapkan serta diverifikasi pada 2026-10-24 WIB; backfill data belum dijalankan.

## Pelaksanaan migrasi dev dan prod — 2026-10-24 WIB

Atas instruksi pengguna, Prisma `migrate deploy` dijalankan ke dua target yang berbeda, dev lalu prod. Pemeriksaan awal masing-masing menemukan tepat satu migrasi tertunda: `20261024010000_group_automatic_pricing`. Keduanya selesai dengan exit 0. Query baca langsung memverifikasi `pricingConfig` bertipe `jsonb`, nullable, dan catatan migrasi selesai tanpa rollback.

Environment dimuat eksplisit dari `packages/db/env.development.env` dan `packages/db/env.production.env`; tidak ada kredensial dicetak atau dimasukkan commit. File `.env.production` yang dirujuk script lama tidak tersedia, sehingga migrasi memakai file produksi aktual. Perintah setara untuk operator dari root proyek:

```powershell
pnpm exec dotenv -o -e packages/db/env.development.env -- pnpm --filter @pos/db exec prisma migrate deploy
pnpm exec dotenv -o -e packages/db/env.production.env -- pnpm --filter @pos/db exec prisma migrate deploy
```

SQL hanya menambah kolom nullable pada tabel grup. Tidak ada reset, seed, backfill, atau perubahan harga/HPP produk yang dijalankan. Writer normal versi baru menginisialisasi grup legacy secara transaksional; backfill massal tetap merupakan operasi terpisah.

Verifikasi hasil gabungan dengan main terbaru: 140/140 tes pada 14 berkas lulus, browser form satuan lulus, pemeriksaan tipe web exit 0, dan staging hanya memuat 112 berkas fitur tanpa konflik. Migrasi dev/prod diverifikasi terpisah melalui query baca.

## Hasil integrasi akhir

- Review menyeluruh menemukan tiga celah yang diperbaiki dalam commit `eed6c5f7`: intent impor terpisah dari preview, integrasi Ubah Harga katalog/POS, dan panduan harga utama. Scoped rereview menyetujui seluruh temuan; tidak ada regresi baru yang dikonfirmasi.
- Perubahan fitur saja diterapkan dari baseline `d77c7e34` ke `C:\Projects\pos-system-monorepo`: 112 berkas, dengan backup lokal. Sebanyak 4.172 path perubahan lain dipertahankan; HEAD, branch dan index checkout utama tidak berubah.
- Prisma Client v6.19.2 berhasil digenerasi dari schema baru tanpa koneksi atau perubahan database. Pemeriksaan tipe langsung web, database dan product-import-worker lulus dengan exit 0.
- Verifikasi di checkout utama: 99/99 tes pada 12 berkas, 45,49 detik; browser komponen nyata lulus untuk katalog, POS master, POS transaksi saja, dan formulir impor (4 skenario). Permintaan browser memakai data contoh/intersepsi, bukan server produksi.
- Suite web lengkap sebelum perbaikan final sudah lulus 4.088 tes dengan 10 dilewati. Sesudah perbaikan: 50/50 tes terfokus, lint dan type-check lulus di worktree; hasil 99/99 dan browser di atas memverifikasi transfer final. Tidak mengulang suite lengkap.
- Screenshot final tersedia pada `apps/web/public/images/changelog/harga-otomatis-grup-panel-2026-10-24.png`. Semua 24 keputusan pada lampiran tetap utuh. Drive D: tidak tersedia, sehingga dokumentasi disimpan di markdown-files proyek aktual.
- Tidak ada migrasi/backfill live, deployment, push/merge, perubahan dependensi atau pengelolaan lifecycle server. Batas Headroom/GitNexus dan ketiadaan uji konkurensi PostgreSQL live tetap berlaku.

## Perilaku yang tersedia

Grup baru dan lama memakai Auto secara default. Satu anggota aktif menjadi sumber harga jual dan HPP. Pengikut Auto dihitung langsung dari sumber; pengikut Manual menyimpan uangnya sendiri. Harga jual lama tetap saat inisialisasi karena faktor disimpan sebagai pembilang/penyebut eksak, termasuk rasio yang tidak dapat ditulis sebagai persen desimal terbatas. HPP lama dapat berubah mengikuti sumber dan perubahan tersebut diaudit.

| Nilai | Rumus |
| --- | --- |
| Konversi relatif | multiplier pengikut ÷ multiplier sumber |
| HPP Auto | HPP sumber × konversi relatif |
| Harga jual Auto | harga jual sumber × konversi relatif × faktor |
| Diskon 10% | faktor 9/10; HPP tidak didiskon |

Input uang dinormalisasi ke dua desimal dengan pembulatan half-up sebelum menjadi sumber perhitungan. Faktor tetap rasional; hasil uang akhir dibulatkan half-up dua desimal. Pengikut tidak dihitung berantai dari pengikut lain. HPP null tetap berbeda dari nol.

### Contoh Snowman V5

Beli 10 pak dengan isi 12 pcs/pak berarti stok masuk 120 pcs memakai HPP pcs. Dengan HPP pcs Rp2.000, HPP pak Rp24.000. Harga pcs Rp3.000 dan pak lama Rp32.400 membentuk faktor 9/10. Mengubah harga pcs ke Rp3.500 menghasilkan harga pak Rp37.800; HPP pak tetap Rp24.000. Screenshot memakai data contoh: HPP pak tersimpan Rp21.000 terlihat sebelum pratinjau, lalu menjadi Rp24.000 setelah proyeksi.

![Panel harga Snowman dengan sumber pcs, diskon jual pak 10 persen, serta tinjauan harga dan HPP setiap satuan](../apps/web/public/images/changelog/harga-otomatis-grup-panel-2026-10-24.png)

### Alur pengguna

1. Buka Produk → grup produk → Harga. Pilih **Sumber harga** aktif, isi harga jual dan HPP sumber. Perubahan detail produk/grup/satuan disimpan dahulu sebelum memakai aksi harga terpisah dari editor produk.
2. Pilih **Auto** dengan tanpa penyesuaian, diskon atau markup, atau **Manual** untuk uang independen. Kembali dari Manual ke Auto mempertahankan harga jual lewat faktor baru dan menghitung ulang HPP. Pengaturan faktor eksak tersedia dalam disclosure.
3. Klik **Pratinjau harga**, periksa harga jual, HPP, margin dan peringatan sebelum/sesudah setiap satuan, lalu **Terapkan harga grup**. Angka sebelum pratinjau dilabeli harga tersimpan/Belum dihitung. Mengubah draf membatalkan pratinjau. Konflik data memuat snapshot terbaru dan memerlukan tinjauan ulang.

Anggota nonaktif tetap bernama dan terlihat pada hasil, tanpa kontrol pengeditan. Satuan tambahan default Auto faktor 1; Manual dan penyesuaian dapat dipilih sebelum create. Pada produk baru beberapa satuan, sumber adalah satuan terkecil dan seluruh preview Auto memakai sumber yang sama. Contoh primary pak 3,33/HPP 2,22 dengan 12 pcs menghasilkan sumber 0,28/0,19, lalu pak 3,36/2,28; sumber dibulatkan dahulu. Tie HPP 2,01 ÷ 2 menghasilkan sumber 1,01.

### Perbaikan final 2026-10-24

- Impor menyimpan `price`/`costPrice` asli (termasuk HPP kosong untuk mewarisi sumber); angka efektif berada di `pricingPreview`. Baris legacy otomatis dilewati tetap skip melalui payload Drawer, perencanaan start, dan commit tanpa menulis harga, konfigurasi, atau audit. Pilihan baris menghitung ulang dari intent asli lewat endpoint preview yang sama. Respons lama dibatalkan/diabaikan; commit menunggu hasil terbaru dan pilihan skip tetap bisa dibatalkan.
- **Ubah Harga** pada katalog dan POS membuka **Atur harga grup / Manual** untuk uang master biasa. Sumber, Auto/Manual, pratinjau server, token versi, dan penolakan data usang memakai workspace yang sama. **Simpan Harga** mengirim hanya Agen/Dinas yang berubah; HPP Auto dan harga normal yang tidak berubah tidak dikirim. Draft Agen/Dinas dan Harga Khusus tetap ada saat data refresh atau workspace ditutup.
- Izin editor cepat tetap mengikuti `product.update` pada pemanggil POS/katalog. Harga Khusus POS saja menghasilkan `masterUpdate: null`. Perubahan grup terpisah tidak menimpa snapshot transaksi di keranjang. Panduan utama Owner/Admin, FAQ2, dan workflow asisten perubahan harga telah disesuaikan.
- Bukti RED: empat regresi intent impor; lima payload harga; dua primary workflow; route repreview; browser draft refresh dan pilihan skip. Bukti GREEN final: 50/50 tes terfokus dalam enam berkas, browser nyata katalog/POS/Harga Khusus (3 skenario), dan Drawer impor (payload asli, pending gate, pilihan bolak-balik, respons usang). Direct web `tsc --noEmit` dan lint berkas berubah lulus. Log tersedia di `output/final-fix-*` pada worktree implementasi.
- Suite penuh 4.088/4.088 sebelumnya tidak diulang. Uji browser menggunakan komponen sebenarnya dengan jaringan contoh yang diintersepsi; transaksi impor memakai database in-memory dengan resolver/perencana/writer sebenarnya. Tidak ada klaim uji race PostgreSQL live, migrasi, deployment, atau perubahan lifecycle server. Headroom dipanggil tetapi proxy kompresi tidak terhubung; GitNexus memakai indeks lama dan pemeriksaan scope sumber sebagai fallback.

### Kondisi yang perlu ditinjau

| Kondisi | Dampak dan tindakan |
| --- | --- |
| Sumber hilang/nonaktif atau ambigu | Nilai yang tidak dapat dihitung dipertahankan. Pilih satu sumber aktif yang benar, lalu pratinjau ulang. |
| Konversi invalid atau ditandai review | Perbaiki hubungan satuan pada tab Satuan, tinjau perubahan stok/konversi, lalu ulangi pratinjau harga. |
| Harga sumber nol, faktor sudah valid | Perhitungan menghasilkan nol dan faktor tetap disimpan. Tidak ada pembagian dengan nol. |
| Harga sumber nol, faktor belum dapat diturunkan | Harga jual lama tetap dengan review. Isi sumber bukan nol untuk menurunkan faktor dari harga lama atau tentukan penyesuaian secara eksplisit. |
| HPP sumber belum diisi | HPP yang tidak dapat dihitung tetap sebelumnya/null; tidak diubah menjadi nol. Isi HPP sumber untuk memperbaiki, lalu tinjau ulang. Harga jual tetap dapat dihitung secara terpisah. |
| Menulis HPP pengikut Auto | Gunakan sumber atau ubah pengikut ke Manual melalui alur pratinjau. Pesan validasi menjelaskan tindakan tersebut. |

Harga supplier pada dokumen penerimaan/pembelian adalah snapshot dan tidak selalu mengubah HPP master. Hanya penulisan HPP master nyata memproyeksikan grup. Kebijakan lama shopping/create/edit/add menekan write jika HPP sama, sehingga pembelian tetap dapat selesai tanpa perubahan uang/config/log harga. Intent master-write pengikut Auto yang sudah tersimpan tetap ditolak, termasuk nilai sama; perubahan nyata non-equal mengembalikan 422 dan membatalkan transaksi.

## Cakupan implementasi

- Domain eksak dan `ProductStockGroup.pricingConfig` JSON nullable. Config memuat sumber, revisi, versi inisialisasi, mode/faktor dan alasan review per bidang.
- Service transaksi bersama, urutan lock grup/produk, snapshot versi, preview tanpa write dan apply yang memvalidasi versi beserta proyeksi di dalam transaksi. Harga, HPP, konfigurasi dan audit tersimpan atomik.
- Task 3a: create/update **PUT**/delete/bulk produk, create grup, gabung/pindah/lepas/nonaktif anggota, perubahan konversi dan tambah varian. Sumber lama/baru direkonsiliasi; niat Manual/faktor didukung sebelum penyimpanan.
- Task 3b: preview dan commit impor langsung maupun worker, perluasan chunk ke seluruh grup terkait, serialisasi batch, pemulihan status concurrent, snapshot config/harga dan undo dengan validasi konflik. Satu grup besar dapat melebihi ukuran chunk nominal supaya proyeksinya tetap atomik.
- Task 3c: finalisasi HPP master pembelian/penerimaan/Daftar Belanja, termasuk perbedaan snapshot supplier, equal no-op dan explicit master-write.
- Panel harga, editor produk, form satuan baru, cache products/stats/grup/inventory/price logs/categories/dashboard dan transport `no-store`. Snapshot transaksi, harga Agen/Dinas, aturan harga khusus, stok serta kebijakan checkout tetap menggunakan jalur yang ada.
- Bantuan Owner/Admin/Inventori, FAQ 5 dan workflow assistant, panduan create multiunit dan Catatan Perubahan diperbarui. Tidak ada perubahan mekanisme popup tujuh hari.

## Sampel offline yang dapat diulang

Semua perintah dari root repository. Fixture berikut ikut dikirim dalam perubahan dan hanya memakai data contoh:
`apps/web/scripts/fixtures/group-pricing-sample.json`.

```powershell
pnpm --filter @pos/db exec tsx ../../apps/web/scripts/backfill-group-pricing.ts --dry-run --input=../../apps/web/scripts/fixtures/group-pricing-sample.json --adapter=../../apps/web/scripts/group-pricing-backfill-adapter.ts
pnpm --filter @pos/web exec vitest run features/help-documentation/__tests__/automatic-group-pricing-help.test.ts features/product-stock-groups/__tests__/automatic-pricing-backfill.test.ts features/product-stock-groups/__tests__/group-pricing-adapter.test.ts
```

Sampel dry-run harus melaporkan `scanned=1, pending=1, initialized=0, skipped=0`, faktor pak 9/10, harga pak 32400.00 dan perubahan HPP 21000.00 → 24000.00. `--input` membaca JSON tanpa koneksi database; adapter dimuat tetapi tidak dipanggil saat preview. Tes sampel memverifikasi writer tidak dipanggil, satu apply in-memory menghasilkan `initialized=1`, kemudian rerun `initialized=0, skipped=1` tanpa write tambahan. Tes adapter transaksi yang terpisah menjalankan service/adapter nyata di fixture database dalam memori dan memeriksa audit HPP serta idempotensi. Ini bukan bukti penguncian PostgreSQL terhadap database live.

CLI sengaja menolak `--apply` bersama `--input`: tidak ada apply database dari sampel. Hasil perintah aktual dicatat dalam verifikasi di bawah.

## Urutan deployment oleh operator

Langkah berikut adalah panduan operasional. Migrasi schema dev/prod telah dijalankan dan diverifikasi sebagaimana dicatat di atas; deployment aplikasi/worker serta backfill dalam panduan ini belum dijalankan.

1. Cadangkan database dan simpan artifact aplikasi/worker sebelumnya. Operator menghentikan penerimaan pekerjaan impor baru, menguras pekerjaan yang sedang aktif, lalu menghentikan worker lama. Hindari writer SQL lama setelah schema/config baru aktif karena writer itu tidak menjaga invariant harga grup.
2. Terapkan migrasi schema `20261024010000_group_automatic_pricing`. SQL hanya menambah kolom nullable, tanpa menulis uang produk. Untuk file environment produksi aktual dari root proyek: `pnpm exec dotenv -o -e packages/db/env.production.env -- pnpm --filter @pos/db exec prisma migrate deploy`. Jangan memakai reset atau seed.
3. Jalankan `pnpm db:generate` pada artifact release sesudah schema tersedia. Deploy aplikasi dan import worker yang kompatibel sebagai satu release. Operator melanjutkan worker/antrean hanya setelah keduanya memakai versi ini. Tidak ada lifecycle proses yang dijalankan agent.
4. Jalankan preview database tanpa write dengan environment target yang benar dan simpan hasilnya untuk ditinjau. Bare `--dry-run` membaca semua grup per batch 100, bukan fixture offline.

```powershell
# Operator: environment DATABASE_URL target sudah disediakan secara aman.
pnpm --filter @pos/db exec tsx ../../apps/web/scripts/backfill-group-pricing.ts --dry-run
```

5. Tinjau setiap perubahan HPP, sumber, konversi, faktor dan review lintas toko; cocokkan dengan backup. Setelah persetujuan operasional, jalankan adapter transaksi yang mengunci dan membaca ulang tiap grup, menyimpan hasil serta audit HPP dalam transaksi yang sama.

```powershell
# Operator: ini menulis database target; belum dieksekusi pada sesi implementasi.
pnpm --filter @pos/db exec tsx ../../apps/web/scripts/backfill-group-pricing.ts --apply --adapter=../../apps/web/scripts/group-pricing-backfill-adapter.ts
pnpm --filter @pos/db exec tsx ../../apps/web/scripts/backfill-group-pricing.ts --dry-run
```

6. Periksa jumlah `scanned/initialized/pending/skipped`, audit dan alasan review. Pada rerun grup berconfig dilewati; inisialisasi concurrent yang sudah dilakukan transaksi lain juga dihitung skipped. Rerun tidak otomatis memperbaiki review yang tersimpan: lakukan repair lewat alur sumber/konversi/faktor/HPP dan pratinjau versi. Periksa katalog, POS dan riwayat; operator membuka kembali penerimaan impor setelah release kompatibel terverifikasi.

### Rollback

Penambahan kolom nullable aman dibiarkan saat rollback kode sebelum ada proyeksi/penulisan baru. Sesudah backfill atau aktivitas normal, rollback kode saja tidak membalik HPP, faktor, audit, hasil impor maupun snapshot transaksi. Jangan menghapus config atau audit untuk memaksa inisialisasi ulang: itu dapat kehilangan faktor eksak dan jejak perubahan.

Operator perlu menguras writer/worker sebelum rollback dan memilih forward repair melalui versi kompatibel atau restore backup terkoordinasi berdasarkan waktu/audit yang diperiksa. Restore menyeluruh dapat menghilangkan transaksi setelah backup; rekonsiliasi stok, pembelian, transaksi dan antrean diperlukan. Worker lama tidak boleh dilanjutkan pada data aktif yang masih mengandalkan invariant baru.

## Verifikasi dan batas

Catatan historis berikut merujuk pada sesi implementasi sebelum pelaksanaan migrasi dev/prod yang tercatat di bagian atas.

- Dokumentasi TDD: run terfokus sebelum isi diperbarui menghasilkan 7 gagal/1 lulus; sesudah perubahan 8/8 lulus. Sebelumnya fixture yang belum tersedia menghasilkan satu ENOENT; fixture ditambahkan dan RED diulang sehingga kegagalan panduan dapat diamati secara benar.
- Task 2: 79/79 tes dalam 13 berkas lulus setelah normalisasi input uang. Task 3a: 308/308 tes dalam 43 berkas; Task 3b fix terfokus: 43/43 dalam 3 berkas; Task 3c equal-HPP characterization: 24/24. Masing-masing menyelesaikan type-check dan lint sesuai scope.
- Task 4 baseline: 413/413 dalam 51 berkas; refinement: 81/81 dalam 9 berkas. Lima browser harness memakai komponen/CSS nyata dan intercepted sample routes tanpa server. Bukti mencakup stale 409/draf/fokus, pending preview, null/nol HPP, faktor eksak, keyboard, layout 375 px tanpa overflow dan label source dengan kontras minimum 12,02:1. Harness tidak memuat font binary Next; fallback font lokal dipakai. Bukan klaim audit WCAG lengkap.
- Task 4 fix `4857d7e2` diterima reviewer: konsistensi semua Auto dengan sumber, half-up default sumber, dan kepemilikan save-lock diperbaiki dengan tes terfokus. Suite web penuh Task 5 selesai dalam satu run: **545 berkas lulus, 2 dilewati (547); 4.088 tes lulus, 10 dilewati (4.098)**, tanpa kegagalan. Mulai 11:26:48 WIB, durasi 1.617,94 detik. Tes yang dilewati tidak diklaim telah diverifikasi. Notice Browserslist yang sudah ada tetap muncul; tidak ada pembaruan dependency.
- GitNexus memakai indeks checkout asli yang stale; impact HelpContent, FAQ_WORKFLOWS dan AUDITED_HELP_STEP_TARGETS LOW, 0 caller langsung/0 proses pada indeks tersebut. Beberapa simbol baru UNKNOWN. Worktree tidak terdaftar untuk detect-changes; fallback scope diff dilakukan. Upaya reindex native sebelumnya gagal; tidak ada perbaikan tooling/dependensi.
- Headroom stats dan compress dipanggil; proxy `127.0.0.1:8787` tidak terjangkau sehingga kompresi praktis no-op. Output dibatasi. Pada sebagian subtask tool pernah tidak tersedia; laporan memakai fallback output terbatas. Tidak ada kredensial yang dikirim.
- Drive D: tidak tersedia; dokumentasi disimpan pada `markdown-files` di repository aktual. Tidak menjalankan production build, server lifecycle, live DB/migrasi/backfill, dependency update, deploy, push atau merge. Perintah operator di atas tidak diklaim telah berjalan.

### Perintah akhir Task 5

Full suite menggunakan pnpm --filter @pos/web test sekali pada sumber Task 4 fix yang diterima. Run selesai tanpa kegagalan; perbaikan assertion visual dokumentasi juga telah diverifikasi secara terfokus (42/42). Tidak ada fullsuite ulang. Tinjauan menyeluruh dan transfer ke checkout pengguna belum diklaim selesai.

```powershell
pnpm --filter @pos/web test
pnpm exec turbo run type-check --only
pnpm --filter @pos/web type-check
pnpm --filter @pos/db type-check
pnpm --filter @pos/product-import-worker type-check
# Daftar berkas feature aktual dari git, tanpa source di luar perubahan:
$paths = @(git diff --name-only d77c7e3 -- '*.ts' '*.tsx' '*.mjs')
$paths += 'apps/web/features/help-documentation/__tests__/automatic-group-pricing-help.test.ts'
pnpm exec eslint @paths
$env:DATABASE_URL = 'postgresql://sample:sample@127.0.0.1:5432/sample'
$env:DIRECT_URL = $env:DATABASE_URL
pnpm --filter @pos/db exec prisma validate
```

Prisma validation lulus dengan kedua URL dummy (tidak menghubungi database). Percobaan awal hanya DATABASE_URL gagal karena DIRECT_URL wajib; diperbaiki pada invocation berikutnya. CLI sample offline lulus dengan scanned 1/pending 1/initialized 0/skipped 0 dan perubahan HPP 21000.00→24000.00. Rerun empat berkas HelpContent/sampel/backfill/adapter lulus **42/42** setelah assertion visual lama diperbaiki: mencari langkah Inventori berdasarkan judul, alih-alih indeks5 yang bergeser saat langkah harga ditambah. Regresi dokumentasi awal **145 lulus/3 gagal** dari148 adalah assertion indeks tersebut, bukan kegagalan harga.

`pnpm exec turbo run type-check --only` lulus **4/4 task** (2 cached); web/db berjalan di worktree, dua log cache ui/worker mencantumkan path checkout asal. Pemeriksaan langsung web, db dan product-import-worker di worktree juga lulus, sehingga perubahan worker diperiksa pada checkout fitur. ESLint seluruh berkas TS/TSX/MJS feature lulus dengan **0 error, 11 warning console** yang sudah ada pada dua browser script; lint terfokus dokumentasi tidak mengeluarkan output.

Percobaan awal `pnpm type-check` menjalankan dependency task `@pos/db:build` melalui Turbo (`^build`), yang menjalankan Prisma generate dan gagal EPERM saat rename DLL Windows. Tidak ada Next production build yang berjalan; tidak ada server dihentikan dan tidak ada retry generator/DLL. Validasi dilanjutkan lewat `--only` dan perintah paket langsung. Generated client fitur sudah dihasilkan pada tahap sebelumnya. Jangan menafsirkan perintah root yang gagal sebagai type-check lulus.

GitNexus `detect-changes --scope compare --base-ref main --repo . --limit 5` dicoba dan gagal karena worktree tidak terdaftar. Impact CHANGELOG UNKNOWN pada indeks stale; pembaca yang relevan diliput tes changelog. Scope diffs dan `git diff --check` menjadi fallback, tanpa reindex atau perubahan dependency.
## Lampiran keputusan

Setiap butir berikut menyimpan keputusan controller dalam urutan aslinya, disertai penjelasan Indonesia mengenai alasan dan biaya jika keputusan keliru. Baris `Ruling:` asli dipertahankan agar seluruh keputusan dapat ditelusuri tanpa berkas kerja sementara.

### Keputusan 1

Lanjutkan implementasi berdasarkan otorisasi pengguna; persetujuan desain telah selesai. Alasannya menghindari pengulangan persetujuan; biaya salah tafsir dibatasi lewat tes dan review.

> Ruling: Continue autonomously after the user's explicit implementation authorization; spec and design approval are settled — avoids another approval loop — risks are handled with tests and review.

### Keputusan 2

Gunakan worktree native yang HEAD/status-nya telah diverifikasi sambil registrasi aplikasi tertunda. Scan berkas ignored menyebabkan penundaan; risiko salah checkout ditangani dengan verifikasi git, tanpa reset.

> Ruling: Native worktree checkout is verified via git worktree list, matching HEAD and clean status; app registration is delayed by its ignored AGENTS.override.md scan — use the verified checkout while registration finishes — no checkout/reset process remains active.

### Keputusan 3

Snapshot pekerjaan pengguna menjadi baseline d77c7e3 dan tidak dipindahkan sebagai patch fitur. Tujuannya mempertahankan pekerjaan pengguna; biaya jika keliru adalah konflik atau perubahan pengguna tertimpa, sehingga transfer wajib apply-check.

> Ruling: Existing tracked changes plus nonignored apps/packages files are snapshotted in the isolated checkout as baseline d77c7e3, never included in the feature patch transferred back — preserves user work — transfer requires an apply check against current original state.

### Keputusan 4

Adaptasi PowerShell hanya bila helper Bash tidak dapat berjalan. Git Bash ditemukan dan helper berhasil; biaya alternatif adalah perbedaan perilaku shell yang perlu diverifikasi.

> Ruling: Use PowerShell-compatible script adaptations only if bundled bash helpers cannot run; Git Bash was located and sdd-workspace executed successfully.

### Keputusan 5

Awalnya gunakan konvensi UI saat ini dan kontrol harga yang diperlukan. Otorisasi implementasi mencakup pilihan rutin; biaya bila arah visual kurang sesuai adalah perbaikan lokal, kemudian disempurnakan keputusan ledger.

> Ruling: Use current UI conventions during implementation and limit visuals to needed pricing controls; full implementation authorization governs routine UI choices.

### Keputusan 6

Simpan dokumentasi di markdown-files repository aktual karena drive D: tidak ada. Konsekuensinya lokasi berbeda dari instruksi path lama; isi tetap ikut perubahan dan dapat ditransfer.

> Ruling: Documentation is stored under actual repository markdown-files because D: is absent.

### Keputusan 7

Backfill Task 1 menerima adapter transaksi/audit; Task 2 wajib melengkapi adapter serta CLI apply. Ini menghindari dua implementasi persistensi; kelalaian wiring akan memblokir kelengkapan fitur.

> Ruling: Task 1 backfill apply uses an injected transaction/audit adapter; Task 2 must supply the complete adapter and runnable --apply path before feature completion — avoids a second temporary persistence implementation — missing final wiring blocks completion.

### Keputusan 8

Sumber jual nol hanya mempertahankan harga pengikut bila faktor belum dapat diturunkan. Faktor valid tetap menghasilkan nol dan disimpan. Ini mengikuti rumus yang disetujui; mengubah interpretasi memerlukan kebijakan baru, bukan membagi nol. Dokumentasi dan tes wajib mencakup kedua keadaan.

> Ruling: Source selling price zero requires holding prior follower price only when its adjustment ratio cannot yet be initialized/derived (spec 6.4). An existing valid ratio remains computable and may produce zero with the ratio retained — matches the accepted formula and existing zero-price inputs — if this business interpretation is changed later it requires a policy change rather than dividing by zero. Add explicit documentation/testing coverage before final completion.

### Keputusan 9

Task 3 dibagi berurutan menjadi 3a writer produk/anggota, 3b impor/undo lintas chunk, dan 3c HPP pembelian. Ada 13 writer master; pembagian menjaga review terfokus dan satu implementer. Biayanya tambahan review; semua slice wajib selesai.

> Ruling: Execute Task 3 as three sequential implementation/review slices because its 13 master writers and cross-chunk import/undo contract exceed one focused review surface. 3a owns ordinary product and group membership routes; 3b owns import preview/commit, chunk coherence and batch undo snapshots; 3c owns purchase master-HPP finalization. Task 3 is complete only after all slices pass. This preserves the approved scope and the one-implementer rule; extra review is the cost.

### Keputusan 10

Normalisasi semua intent uang ke dua desimal half-up sebelum menurunkan faktor/proyeksi, termasuk sumber dan Manual. Sumber tersimpan menjadi jangkar; faktor tetap eksak. Biaya pembulatan input adalah perubahan sen pada tie, dilindungi regresi round-trip dan no-op.

> Ruling: Normalize every explicit money intent to persistable2dp half-up before deriving factors/projecting followers, including source price/cost and direct follower/Manual money. Preserve accepted decimal inputs; persisted source is the calculation anchor. Add exact round-trip/no-op regressions. This rules on input boundary only; rational factors and final follower rounding remain exact.

### Keputusan 11

Endpoint edit produk aktual adalah PUT, bukan shorthand PATCH pada rencana. Pertahankan kontrak/caller PUT tanpa alias tidak terpakai; risiko salah label ditangani payload Task 4 yang mengikuti implementasi.

> Ruling: Task3a source inspection confirms ordinary product update is PUT, despite plan/audit shorthand PATCH. Integrate existing PUT and keep its callers; do not add an unused PATCH alias. Exact existing API contract takes precedence over label shorthand, and Task4 consumes the reported PUT payload.

### Keputusan 12

Create harus menerima Manual/faktor pengikut sebelum simpan dengan nama pricingMode/priceFactor. Default tetap Auto1 dan sumber tetap jangkar. Menunda sampai edit berikutnya melewatkan perilaku yang disetujui; biaya tambahan adalah plumbing intent create dan tes uang efektif.

> Ruling: Task3a creation APIs must accept optional new-follower Manual/adjustment intents before saving (design section7), matching variants pricingMode/priceFactor names where practical. Additional units and top-level created follower (existing-group join or legacy packaging member) need support; defaults remain Auto1 and source stays anchor. A later-edit-only workaround would miss approved new-unit behavior. Task4 reflects effective rounded money and sends these explicit optional intents.

### Keputusan 13

Editor produk boleh memakai workspace harga versi sebagai aksi terpisah dengan guard identitas/draf. Ini solusi kecil untuk atomicity/preview; jika satu save gabungan dipilih, proyeksi harus divalidasi dalam transaksi sama. Biaya pilihan terpisah adalah dua aksi pengguna yang dijelaskan secara terbuka.

> Ruling: Ordinary product editor may reuse the existing versioned group pricing workspace as an explicit separate price-edit action with pending-identity/draft guards, rather than adding a broad product-mutation preview API. If retaining one combined save for money+other data, it must validate corresponding preview under that same tx; no silent split of one save into two writes. This keeps the approved preview/atomicity requirements while permitting the smallest coherent UI.

### Keputusan 14

Schema create boleh tetap mewajibkan price legacy; uang pengikut Auto diabaikan sebagai placeholder dan hasil efektif dikembalikan. Ini mempertahankan kompatibilitas API tanpa meminta pengguna menghitung uang. Biaya ergonomi adalah field wajib untuk caller lama; penghapusan kewajiban dapat dikerjakan terpisah.

> Ruling: Existing create schemas may retain required legacy price fields; supplied AUTO follower money is ignored as placeholder and effective projection returned. Spec7 requires automatic user flow/default1 with pre-save Manual/adjustment, not optional omitted-price acceptance at every existing API. Corrected imprecise review-focus wording. Task4 must not ask users to manually calculate Auto follower money. This avoids unnecessary schema broadening; a future API ergonomics change can make those fields optional if needed.

### Keputusan 15

Chunk impor diperluas ke grup terhubung dan memakai lock baris batch untuk status/jumlah. Seluruh grup commit atomik dan worker merekonsiliasi hasil; dependensi baru memerlukan replan sebelum perluasan lock produk. Biayanya grup besar dapat melebihi chunk nominal, dibatasi maksimum impor.

> Ruling: Task3b expands requested cursor slices to complete connected import groups (old/target identity union) and uses a batch-row lock to serialize chunk state/counts. Expanded planned rows commit atomically and worker reconciles their statuses; retries/fallback cannot write a follower after a failed source. No scheduler/schema added. Revalidate membership/source under locks, fail/replan on newly introduced dependencies rather than post-product lock expansion. Cost: a large connected group can exceed nominal chunk size (bounded by import max; statement splitting allowed within one tx). Test out-of-order/concurrent requests, prior failed peers, row mapping/idempotency/counts and independent-group fallback. Undo lock ordering must align.

### Keputusan 16

Untuk impor legacy yang mengubah uang atau membuat produk grup tanpa snapshot config/kaskade, penolakan aman409 dapat diterima. Undo stok/nonuang yang tidak berkaitan tetap diizinkan bila aman. Alasannya mencegah rollback menimpa harga grup yang tidak dapat dibuktikan; biayanya sebagian undo impor lama ditolak dan perlu penanganan operator.

> Task3b additional milestone: out-of-order independentcursor RED found premature done=true; nextCursor earliest-pending fix under test. Stock/move RED3 thenGREEN14 with moved-source realpreimage, createdgroup stock0 undo and exact inventory reversals. Broader fixtures being upgraded withoutmockedpricing. Ruling: safe409 for legacy money-affecting/created-product grouped imports lacking config/cascade snapshots is acceptable; preserve unrelated stock-only/nonmoney undo where safe. Report exact scope. Remaining retry/route/rollback/race/finalvalidation gates active; not complete.

### Keputusan 17

Rekonsiliasi kegagalan worker harus menjaga baris yang telah dicommit API concurrent. Tambahkan RED dan perbaikan status/lock kecil. Menundanya berisiko menandai baris sukses sebagai gagal dan mengulang write.

> Ruling: Task3b worker failure reconciliation must preserve rows concurrently committed by the direct API; add a focused RED and a narrow status/lock fix before its final review — this is part of the accepted concurrent import/idempotent status contract — deferring risks a committed row being marked failed and retried.

### Keputusan 18

Pertahankan equal-HPP no-op pada shopping/create/edit/add; finalizer tetap menolak explicit Auto follower master-write tersimpan, termasuk nilai sama. Spec berlaku pada write nyata, bukan snapshot supplier. Biaya jika pengguna mengharapkan 422 lebih ketat adalah pembelian equal tetap selesai; kebijakan itu perlu perubahan UX tersendiri. Tambahkan characterization outer transaksi, tanpa RED buatan untuk perilaku yang sudah ada.

> Ruling: Preserve existing equal-HPP purchase/shopping no-op suppression, while finalizer still rejects any persisted explicit Auto-follower HPP write intent including equal — approved spec governs actual master writes and preserves historical supplier snapshot semantics, whereas controller review prompt accidentally generalized the finalizer rule to a no-write outer request — cost if wrong: callers expecting strict422 for an equal snapshot instead complete purchase; adopting that stricter policy later changes existing purchase UX. Add real outer equal-value characterization with unchanged master/config/logs, correct report wording, then scoped re-review against this clarified binding policy. No production behavior change or artificial RED is required for an existing-policy characterization.

### Keputusan 19

Permintaan pengguna akan UI lebih kreatif menyempurnakan Task 4 sebelum gate. Lanjutkan arah konkret yang terbatas sambil mempertahankan aturan uang/versi/transaksi; biaya jika arah tidak sesuai adalah rework visual lokal.

> Ruling: The user's new explicit request for a more creative, distinctive UI/UX refines Task4 before its gate. Present a concrete bounded direction and proceed under that authorization, retaining approved money/version/atomicity behavior — developer instructions preserve authorization for routine implementation choices and call for fixing user corrections without another approval loop — cost if wrong: visual direction may require rework, while business rules remain unchanged.

### Keputusan 20

Gunakan ledger harga: sumber sebagai jangkar, garis konversi, hasil sebelum/sesudah berdampingan. Pertahankan body font aplikasi dan mono yang tersedia untuk angka. Alasannya keterbacaan POS dan konsistensi; biayanya kebaruan tipografi lebih kecil dan revisi CSS lokal yang reversibel.

> Ruling: Use a pricing-ledger design with source anchor, conversion rail and adjacent before/after review; retain existing body font and use loaded mono for money/conversions rather than introducing fonts or a global redesign — readable daily POS use and product consistency govern the new creative request — cost if wrong: less typographic novelty, reversible local styling rework. Earlier current-UI-conventions ruling is refined only within this panel.

### Keputusan 21

Sertakan pembulatan half-up default sumber C1 bersama perbaikan konsistensi sumber I1 dan save-lock I2. Persyaratan eksak juga berlaku pada preview yang baru memakai helper lama; biaya adalah perubahan satu sen pada tie dan penyesuaian fixture terfokus, bukan perubahan harga legacy tersimpan.

> Ruling: Include reviewer C1 half-up source-default rounding in Task4 fixround1 alongside I1 and I2 — approved exact2dp half-up/source-consistency requirements apply to the newly reused preview path even though its floating helper predates this diff; fix the bounded source/generated preview calculations, not unrelated numeric UX — cost if wrong: a generated source default at a decimal tie can change by one cent, requiring narrow fixture adjustment rather than changing legacy persisted money.

### Keputusan 22

Penulisan docs Task 5 berjalan paralel dengan fix Task 4 tanpa staging/commit/fullsuite sebelum gate. File independen dan pengguna meminta penyelesaian langsung; biaya bila label berubah hanya revisi docs kecil, sedangkan gate penerimaan tetap berlaku.

> Ruling: Start Task5 documentation authoring in parallel with Task4 fixround1, without staging/committing or full-suite validation until fix commit and review — user asked to stop circling and complete implementation, and these docs/help/changelog files are independent of the source-preview/save-lock fixes — cost if wrong: final labels may require a small documentation revision; Task4 acceptance and final delivery gates remain required.

### Keputusan 23

Gunakan satu review independen menyeluruh untuk Task 5 dan seluruh fitur setelah validasi/commit docs. Review docs terpisah akan mengulang gate yang sama; biaya adalah isolasi review docs lebih kecil, sehingga reviewer wajib memberi verdict eksplisit atas dokumentasi dan perilaku lintas task.

> Ruling: Task5's final-review checklist and the SDD whole-feature review use one comprehensive independent review after Task5 validation/commit — Task5 explicitly includes the final reviewer and no later implementation task consumes its docs, so a separate docs-only pass would duplicate the same gate — cost if wrong: less isolated documentation review; the final reviewer must explicitly verdict Task5 documentation/spec quality alongside cross-task correctness.

### Keputusan 24

Setelah docs dan focused test siap, jalankan validasi baca-saja akhir pada commit4857d7e2 sambil reviewer Task 4 menyelesaikan pemeriksaan; staging/commit tetap menunggu root. Ini mengurangi waktu tunggu tanpa mengubah sumber stabil. Biaya jika fix baru diperlukan adalah rerun pemeriksaan yang relevan, bukan mengulang seluruh suite tanpa alasan.

> Ruling: Once Task5 authoring/focusedtests are ready, run its final read-only validation on committed4857d7e2 while Task4 scoped review finishes; hold staging/commit/acceptance until review verdict — the fix is committed, both review and validation consume stable source, and user requested direct completion without idle cycles — cost if review requires another change: rerun its covering checks/types against that change; do not claim the earlier full run covered later edits.
