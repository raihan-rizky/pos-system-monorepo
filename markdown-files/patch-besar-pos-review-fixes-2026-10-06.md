# Perbaikan hasil review patch besar POS

Tanggal: 6 Oktober 2026. Branch: `codex/fix-big-pos-review`.

## Hasil implementasi

| Temuan | Perbaikan | Bukti regresi |
| --- | --- | --- |
| Kas mencakup kembalian | Penerimaan awal dihitung dalam cents dan dikurangi kembalian dari CASH terlebih dahulu. Overpayment lama tanpa CASH dialokasikan secara deterministik tanpa nilai negatif. | Pembayaran terpisah CASH/TRANSFER, Tempo parsial, kembalian pecahan, dan batas jumlah penerimaan. |
| Transaksi lama berlabel SURAT_JALAN gagal dikembalikan | Transaksi tanpa Surat Jalan dapat memakai bukti penjualan invoice yang tepat dan lengkap walaupun migrasi lama menetapkan sumber SURAT_JALAN. Bukti tidak lengkap, qty berbeda, atau konversi grup yang tidak terbukti tetap ditolak. | Invoice lama dengan produk dan bahan baku; void lalu delete tidak mengembalikan dua kali; kasus ambigu tetap ditolak. |
| Approval tanpa quote tidak memiliki jurnal atomik | Semua pengurangan produk dan bahan baku menulis jurnal bertaut transaksi beserta snapshot pergerakan stok dalam transaksi database yang sama. Approval mencatat sumber TRANSACTION. | Callback `after` tidak dijalankan, tetapi jurnal produk dan bahan baku tetap tercatat. |
| Saldo pelanggan dicatat setelah respons | Checkout, approval, approval draft, dan sinkronisasi penjualan offline mencatat totalOrders, totalSpent bersih, dan piutang bersama penjualan. Tempo tidak menggandakan penambahan piutang. Pembayaran invoice dan reversal memakai urutan lock pelanggan lalu invoice; mutasi stok mengikuti writer yang ada. | Counter tersedia sebelum respons, termasuk Tempo nol/parsial dan transaksi berkembalian. Tes benturan dua koneksi PostgreSQL. |
| Metadata cetak hilang saat approval | Catatan layanan dibawa melalui editor, schema quote, fingerprint, dan penyimpanan. ID baris membedakan layanan berulang; request lama yang ambigu wajib diperiksa. Satuan bahan baku berasal dari katalog server. | Dua baris layanan yang sama tetap menyimpan catatan berbeda; qty bahan baku pecahan tetap didukung. |
| Kuantitas desimal lolos dari keranjang | Input hanya menerima bilangan bulat positif yang aman. Keyboard numerik dipakai; input desimal tidak diteruskan sebagai kuantitas checkout. | Parser menolak `2.5`, `2,5`, nol, angka tidak aman, dan input parsial tidak valid. |
| Waktu Internet hanya dipakai tampilan | `/api/time` dan default tanggal invoice memakai layanan clock server yang sama, dengan cache monotonic dan satu sinkronisasi untuk request bersamaan. Tanggal manual dan tanggal invoice yang sudah ada tetap mengikuti aturan existing. | Jam perangkat yang melenceng tidak mengubah tanggal default tersimpan; fallback dan timeout sumber waktu diuji. |
| Pembayaran hilang pada invoice bertanggal mundur | Query penerimaan awal berdasarkan tanggal ledger terpisah dari query revenue berdasarkan invoiceDate. Perubahan diterapkan pada laporan keuangan dan laporan AI. Pelunasan piutang tetap berdasarkan tanggal ledger sendiri. | Invoice di luar periode tidak menambah revenue periode, tetapi pembayaran pada periode tersebut tetap masuk kas bersih. |

Ledger pembayaran awal juga diperbarui secara atomik ketika approval mengganti metode atau jumlah bayar. Pembayaran terpisah existing dipertahankan saat tidak diubah; metode TEMPO tidak dibuat sebagai penerimaan kas.

## Validasi

- Setiap temuan memiliki tes regresi yang diverifikasi gagal sebelum perbaikan utama dan lulus sesudahnya.
- Suite menyeluruh: 2.206 tes lulus; satu kegagalan berasal dari fixture offline bertanggal lama. Fixture diperbaiki dan seluruh tujuh tes pada file tersebut kemudian lulus. Tidak menyatakan run awal itu sepenuhnya hijau.
- Regresi akhir terarah: 17 file / 160 tes lulus, mencakup seluruh domain yang diperbaiki dan dua endpoint pembayaran piutang.
- Pemeriksaan TypeScript langsung pada paket web lulus. Tidak memakai `pnpm build` atau mengelola lifecycle server dev pengguna.
- ESLint kode yang disentuh: tidak ada error; satu warning dependensi hook existing pada `ApproveDraftDialog` masih tercatat.
- Empat benturan PostgreSQL lulus kembali setelah perubahan ledger approval; cleanup meninggalkan nol schema fixture. Pengulangan sebelumnya mengalami timeout harness 30 detik. Harness kini memakai timeout 60 detik dan membuka koneksi kedua sebelum kasus dimulai; anggaran transaksi route produksi tidak diubah.
- Audit baca-saja database dev: tidak ada pelanggan pada sumber dev yang diperiksa, sehingga tidak ada agregat historis yang dapat dibandingkan. Tidak mengubah saldo historis.

## Pengujian PostgreSQL

Jalankan secara eksplisit dari root:

```powershell
$env:POS_REVIEW_INTEGRATION='1'
pnpm --filter @pos/web exec vitest run features/transactions-stock/services/__tests__/transaction-lifecycle-concurrency.integration.test.ts
Remove-Item Env:POS_REVIEW_INTEGRATION
```

Tes membaca URL dari `packages/db/.env.development` secara lokal tanpa mencetak kredensial. Setiap run membuat schema unik `pos_review_test_*`, menerapkan SQL migrasi yang berurutan, membuat fixture khusus, dan menghapus schema pada cleanup. Migrasi proyek tidak diubah. Salinan SQL fixture menyesuaikan search path untuk `pg_trgm` dan pemeriksaan namespace enum; tiap migrasi memiliki batas commit agar penambahan enum dapat dipakai migrasi berikutnya. Ini pengujian schema/konkurensi, bukan klaim deploy migrasi produksi.

Kasus yang diuji: approval–void, void–delete, pembayaran invoice–void, serta alokasi piutang pelanggan–pembayaran invoice. Barrier memastikan operasi bertumpang tindih. Batas waktu harness memperhitungkan pause buatan; batas transaksi route normal tetap diuji terpisah.

## Dokumentasi dan batas verifikasi

Bantuan dan workflow katalog AI diperbarui untuk kuantitas bulat, sumber waktu Internet dalam WIB, serta pemeliharaan metadata layanan. Bukti stok/saldo historis yang tidak lengkap tetap memerlukan pemeriksaan; patch ini tidak mengarang histori atau menimpa saldo lama.

Headroom dipanggil pada sesi, tetapi proxy lokal tidak dapat dijangkau; kompresi lokal tersedia dan output dijaga terbatas. GitNexus gagal memperbarui indeks karena worker parser crash. Impact pada indeks existing tetap dijalankan; helper baru diperiksa dari kode dan tes karena belum terindeks. Analisis seluruh patch: 121 file, 223 simbol, 40 alur, risiko critical; mencakup perubahan besar sebelum sesi perbaikan ini.

Pengguna meminta integrasi lokal ke `main` pada 6 Oktober 2026. Commit dan merge lokal termasuk permintaan tersebut; push dan deploy belum diminta. Checkout existing dipertahankan agar server dev pengguna tetap memakai patch yang sama.

## Hasil akhir integrasi dan browser

- Regresi akhir: 17 file / 160 tes lulus. Integrasi: empat kasus / empat lulus. TypeScript web dan db lulus; diff check bersih.
- Browser Owner: input `2.5` memakai keyboard numerik dan menonaktifkan Bayar; setelah dikoreksi menjadi `2`, Bayar aktif kembali. Pergantian Dus ke Ball mempertahankan jumlah `2` dan menampilkan subtotal baris Rp 140.000.
- Pemeriksaan langsung `/api/time` sempat timeout pada batas 10 detik; retry lulus dengan HTTP 200, sumber `TIMEAPI_IO_CACHE`, nilai `lastSyncedAt`, dan timezone `Asia/Jakarta`. Kelambatan cold request dicatat; endpoint kemudian terverifikasi memakai sumber Internet.
- Audit baca-saja terakhir mengonfirmasi nol schema fixture tersisa. Database dev tidak mempunyai pelanggan untuk audit agregat historis.
- Produk Paperline yang ditambahkan untuk QA dibuang dari keranjang setelah pengujian. Baris awal ALKOHOL MURNI dengan jumlah satu dipertahankan. Tidak membuat transaksi bisnis atau mengubah shift pengguna.

## Verifikasi integrasi lokal ke main

Permintaan pengguna: `merge to main`, 6 Oktober 2026. Pemeriksaan suite lengkap pada kode yang disiapkan untuk commit lulus: **408 file lulus, 2 file dilewati; 2.213 tes lulus, 8 tes dilewati**, durasi 945,52 detik. Kegagalan fixture offline pada run review sebelumnya sudah tidak muncul.

ESLint seluruh berkas sumber yang disiapkan untuk commit lulus tanpa error. Terdapat satu warning hook existing dan satu warning karena seed diabaikan konfigurasi lint. Resolver plugin memakai `NODE_PATH` sementara menuju penyimpanan pnpm yang sudah terpasang; dependensi dan lockfile tidak diubah. Whitespace staged bersih. GitNexus staged: 180 file, 218 simbol, 40 alur, risiko critical sesuai cakupan patch besar; keterbatasan indeks dan Headroom tetap berlaku seperti catatan di atas.

Commit mencakup kode, migrasi, tes, dan lima dokumen patch. Konfigurasi agen lokal, direktori `.serena`, serta berkas otomatis Next.js tidak termasuk commit. Integrasi memakai fast-forward lokal sehingga pohon kode yang diuji dipertahankan; push dan deploy tidak dilakukan.
