# Pembulatan Harga Jual — 28 Oktober 2026

## Perilaku

Pembulatan aktif secara default, dengan kelipatan Rp500 dan ambang naik Rp50. Sisa harga terhadap kelipatan yang kurang dari Rp50 turun; mulai Rp50 naik. Kelipatan tepat tetap.

| Harga asal | Harga berlaku | Arah |
| --- | --- | --- |
| Rp4.049 | Rp4.000 | Turun |
| Rp4.050 | Rp4.500 | Naik |
| Rp4.500 | Rp4.500 | Tetap |
| Rp4.549 | Rp4.500 | Turun |
| Rp4.550 | Rp5.000 | Naik |

- Pembulatan diterapkan pada hasil akhir setelah pemilihan harga member, rumus, dan harga khusus transaksi.
- Harga master, HPP, faktor konversi, dan transaksi final terdahulu tetap menggunakan data tersimpan.
- Badge **Dibulatkan ke atas/bawah** menjelaskan harga asal, harga final, dan selisih melalui klik, sentuhan, atau keyboard. Harga tetap tidak diberi badge.
- Pengaturan > **Pembulatan Harga** menyediakan saklar, kelipatan, ambang naik, validasi, dan pratinjau langsung.
- Resource RBAC `settings.price_rounding` default hanya Owner. Owner dapat mendelegasikan izin Lihat/Ubah melalui RBAC; akses halaman Pengaturan juga diperlukan.

## Integrasi

- Mesin bersama: `apps/web/features/product-price-rounding/rounding.ts`.
- Katalog/POS/keranjang, harga satuan, formulir produk/member/harga khusus, grup stok, dan pratinjau impor menampilkan harga efektif beserta rincian pembulatannya.
- Transaksi, draft, sinkronisasi offline, dan persetujuan menghitung harga akhir dari kebijakan server. Harga layanan percetakan tetap mengikuti perilaku layanan yang ada.
- PaymentModal menunggu kebijakan tersimpan. Kebijakan terakhir yang valid disimpan di browser agar penghitungan tetap tersedia saat offline.
- Checkout online mengirim snapshot kebijakan; server menolak dengan 409 jika aturan berubah sebelum transaksi disimpan. Kebijakan runtime diperbarui berkala setiap 15 detik dan saat jendela kembali aktif.
- Input harga yang melampaui kapasitas uang menampilkan alert dan memblokir pembayaran/penyimpanan draft.
- Persetujuan menerima intent opsional `AUTOMATIC`/`MANUAL`. Produk baru pada editor ditandai otomatis dan dihitung ulang memakai kebijakan terkini; harga manual tetap mengikuti izin yang ada. Fingerprint melindungi perubahan harga antara penawaran dan persetujuan.
- Pencarian/harga/stok produk AI Assistant mengembalikan harga umum yang sudah dibulatkan sesuai kebijakan aktif.
- Bantuan Owner, FAQ/workflow AI nomor 43, dan catatan perubahan diperbarui. Screenshot catatan perubahan memakai data contoh.

## Database dan penerapan

Migrasi aditif: `packages/db/prisma/migrations/20261028010000_product_price_rounding/migration.sql`.

Migrasi menambahkan `priceRoundingEnabled`, `priceRoundingIncrement`, dan `priceRoundingThreshold` pada StoreSettings, lengkap dengan constraint batas. Prisma Client telah digenerate. **Migrasi dev dan produksi berhasil diterapkan serta diverifikasi pada 2026-10-28 WIB.**

Pemeriksaan awal pada masing-masing target menemukan tepat satu migrasi tertunda, yaitu migrasi pembulatan. Prisma `migrate deploy` selesai dengan exit 0 pada dev, kemudian produksi. Pemeriksaan baca langsung memastikan tiga kolom NOT NULL, default `true`/`500`/`50`, constraint rentang, checksum SQL yang sama, dan tidak ada migrasi tertunda. Environment dimuat eksplisit dari `packages/db/env.development.env` serta `packages/db/env.production.env` tanpa mencetak kredensial. File `.env.production` yang dirujuk script lama tidak tersedia.

Tidak ada reset, seed, atau penulisan harga/HPP produk. Server pengembangan tidak dimulai/dihentikan. Saat validasi publikasi, perintah type-check root memicu build melalui dependensi Turbo; proses dibatalkan segera setelah terdeteksi. Validasi berikutnya memakai tsc langsung per paket, dan checkout pengembangan utama tidak terkena build tersebut. Commit disiapkan dari main terbaru pada branch `codex/product-price-rounding` dengan perubahan pembulatan saja.

## Verifikasi awal pada checkout implementasi

- TDD mencakup batas 49/50 dan 549/550, pecahan, nol, kelipatan tepat, aturan mati/alternatif, validasi/overflow, metadata, izin, checkout, dan persetujuan.
- Tambahan 39 tes mencakup sifat monoton/idempoten, pengulangan setiap blok, ambang nol/kelipatan, normalisasi sen, batas uang, imutabilitas harga/HPP, pergantian kebijakan, total diskon/pajak, request tidak lengkap, no-store, dan kegagalan penyimpanan. Batch tiga file terkait: **51 tes lulus**. Seluruh direktori fitur: **95 tes lulus**.
- Browser fixture memakai komponen aplikasi pada 1280px dan 375px: klik/sentuhan, Enter/Space, tidak menambah keranjang saat badge dibuka, perubahan pratinjau, validasi, simpan, dan tidak ada overflow horizontal.
- Review akhir independen tidak menemukan blocker P1/P2 pada scope fitur.
- Regresi gabungan: **52 file, 776 tes lulus** (`output/rounding-final-regression.log`). Tes lama pada modal persetujuan disesuaikan untuk menyediakan kebijakan pada mock; katalog FAQ diperbarui dari 42 menjadi 43.
- TypeScript `tsc --noEmit --pretty false` lulus (`output/rounding-final-typecheck.log`).
- ESLint terarah lulus tanpa error; 6 warning berada pada mock useMemo dalam tes POS, console keluaran browser fixture, dan dependency useEffect lama pada dialog persetujuan (`output/rounding-final-lint.log`).
- Browser akhir: kedua viewport lulus (`output/rounding-final-browser.log`). Screenshot tersedia di `apps/web/public/images/changelog/pembulatan-harga-jual.png`.
- `git diff --check` tidak menemukan masalah whitespace. `detect_changes` terhadap main selesai (87 file, 104 simbol, 18 proses; risiko critical), termasuk perubahan lokal di luar fitur ini.

## Verifikasi snapshot publikasi

- Snapshot dibuat dari `origin/main` pada branch `codex/product-price-rounding`, dengan perubahan pembulatan dan tes terkait saja.
- TypeScript web dan database lulus memakai `tsc` langsung. ESLint tidak menemukan error (6 warning), dan browser fixture lulus pada 1280px serta 375px.
- Regresi pembayaran dan fitur: **13 file, 108 tes lulus**.
- Suite penuh pertama: 562 file lulus, 5 file gagal, 2 file dilewati (4.362 tes lulus, 7 gagal, 10 dilewati). Penelusuran menemukan FAQ 43 ditempatkan di awal katalog, fixture SSR belum menyediakan kebijakan pembulatan, dan skenario diskon pecahan belum menonaktifkan pembulatan secara eksplisit.
- Tes baru memastikan urutan FAQ 1–43; tes tersebut diverifikasi gagal sebelum katalog diperbaiki. FAQ 43 dipindah ke akhir, fixture SSR diberi kebijakan, dan skenario diskon pecahan menggunakan aturan nonaktif. Regresi keenam file terkait menjadi **47 tes lulus**, termasuk workload AI tanpa pemanggilan provider.
- Hook Husky diinisialisasi pada worktree publikasi. Gerbang commit memakai `pnpm lint-staged`; gerbang push menjalankan seluruh suite melalui `pnpm test`.

## Catatan lingkungan

- Drive `D:` yang diminta AGENTS.md tidak tersedia. Dokumentasi disimpan di checkout aktif `C:/Projects/pos-system-monorepo/markdown-files`.
- Headroom stats awal/akhir tersedia; proxy kompresi tidak terhubung. Keluaran alat dibatasi dan tidak memuat rahasia.
- Refresh indeks GitNexus gagal saat memulai worker native. Analisis impact memakai indeks yang tersedia dengan penelusuran pemanggil tambahan.
- `detect_changes` seluruh checkout mencakup pekerjaan lokal yang sudah ada (152 file, 207 simbol, 77 proses; risiko critical). Hasil tersebut bukan jumlah perubahan fitur ini. Jalur harga penting sudah diperingatkan sebelum implementasi dan diuji secara khusus.
- ESLint memerlukan `NODE_PATH` sementara ke `node_modules/.pnpm/node_modules` untuk menemukan plugin yang sudah terpasang. Tidak ada dependensi atau lockfile diubah.
- Data persetujuan lama tanpa intent tidak dapat membedakan harga manual dari harga otomatis lama jika angkanya sama. Perilaku kompatibilitas dipertahankan; persetujuan dengan intent otomatis memakai aturan terkini.
