# Panduan operasional penutupan inventaris bulanan

Tanggal: 2026-11-01 (Asia/Jakarta)

## Tujuan dan status

Penutupan membuktikan bahwa perubahan inventaris yang tercatat sebelum batas
bulan sudah selesai sebelum batas tersebut. Ekspor memakai batas bulan WIB:
modal awal berasal dari nilai inventaris pada awal bulan dan inventaris akhir
dari batas akhir bulan yang sudah lewat. Untuk bulan berjalan, inventaris akhir
memakai nilai saat ekspor.

Migrasi `20261101140000_inventory_group_valuation_v2` menyiapkan riwayat
produk dan grup; `20261101150000_inventory_month_close` menyiapkan fungsi
penutupan dan tabel penanda. Migrasi penutupan tidak memasang maupun
mengaktifkan job Cron. Rancangan jadwal di bawah perlu dipasang dan diperiksa
secara terpisah untuk setiap lingkungan setelah migrasi yang diperlukan tersedia.
Dokumen ini bukan bukti bahwa migrasi atau job sudah diterapkan di lingkungan
pengembangan maupun produksi.

## Perhitungan dan nilai belum tersedia

- Produk aktif tanpa grup menyumbang `max(stok, 0) × harga jual`. Satu grup
  stok dihitung sekali dengan `max(stok dasar, 0) × harga jual produk dasar`.
  Stok nol atau negatif menyumbang nol.
- Grup dengan stok dasar positif memerlukan tepat satu produk dasar aktif
  yang satuannya cocok dengan satuan dasar grup dan pengalinya satu. Jika
  tidak ada atau terdapat lebih dari satu, nilai yang mencakup grup tersebut
  belum tersedia. Periksa dan perbaiki grup di halaman Produk.
- Periode sebelum saldo dasar yang dapat dibuktikan, atau batas bulan dengan
  transaksi yang belum terbukti selesai sebelum cutoff, juga dapat berstatus
  belum tersedia. Excel membiarkan sel terkait kosong; kosong bukan nol.
  Perbaikan data sekarang atau pengamatan setelah cutoff tidak otomatis
  membuktikan keadaan historis yang sudah lewat.

## Rancangan job Cron

Gunakan Supabase Cron (`pg_cron`) dengan nama `inventory-month-close` dan
jadwal `59 16 * * *` dalam zona waktu Cron UTC, yaitu 23.59 WIB setiap hari.
Pastikan zona waktu Cron benar-benar UTC saat memeriksa konfigurasi; ekspresi
tersebut tidak berarti 23.59 WIB jika zona jadwal diubah. Hari biasa tidak
melakukan penutupan. Pada menit terakhir bulan, job menunggu mendekati cutoff
tanpa mengunci inventaris, lalu melakukan penutupan. Contoh isi job yang
direncanakan:

```sql
SET LOCAL transaction_timeout = '75s';
SET LOCAL idle_in_transaction_session_timeout = '5s';
SET LOCAL statement_timeout = '70s';
SELECT public.pos_wait_for_inventory_month_close();
SET LOCAL statement_timeout = '5s';
SELECT public.pos_close_inventory_month();
```

Jalankan rangkaian ini sebagai job dengan hak eksekusi yang sesuai; fungsi
penutupan tidak diberikan kepada `PUBLIC`. Jangan menambahkan perubahan
inventaris dalam transaksi job. Statement penutupan harus terakhir dan
transaksinya segera commit. Periksa nama fungsi, hak akses, zona waktu, dan
jadwal job yang tersimpan sebelum mengandalkan penutupan. Pastikan hanya satu
job yang aktif untuk tujuan ini di tiap basis data.

Perintah ini memerlukan PostgreSQL 17 atau lebih baru untuk
`transaction_timeout`. Pastikan `cron.use_background_workers` bernilai `off`;
mode koneksi diperlukan agar batas `statement_timeout` diterapkan pada setiap
statement dalam perintah job. Jika pengaturan scheduler berubah, uji kembali
batas waktu melalui job sementara sebelum mengandalkan penutupan. Gunakan
urutan timeout yang sama, ganti fungsi menunggu dengan `pg_sleep(2)` dan fungsi
penutupan dengan `pg_sleep(7)`, lalu pastikan job dihentikan oleh
`statement_timeout` lima detik. Hapus job uji setelah pemeriksaan; jangan
menguji dengan mengubah data inventaris.

Ketika cutoff tinggal sekitar dua detik, fungsi mengambil SHARE lock pada
tabel toko, grup stok, dan produk, mengamati transaksi yang sudah commit,
menahan lock melewati cutoff, kemudian mencatat penanda dan commit. Penulisan
ke tabel tersebut dapat menunggu sebentar. Penutupan memakai batas menunggu
lock 500 ms dan `statement_timeout` maksimal 5 detik. Bila lock tidak didapat,
job terlambat, atau proses gagal sebelum commit, penutupan gagal dengan aman:
perubahan observasi dan penanda pada transaksi tersebut tidak disimpan. Jangan
memundurkan waktu observasi atau membuat penanda secara manual untuk
menyembunyikan kegagalan.

## Pemantauan awal bulan

Pada awal setiap bulan WIB, penanggung jawab memeriksa **keduanya**: riwayat
job dan penanda cutoff untuk pukul 00.00 WIB tanggal 1. Supabase Dashboard
menyediakan Integrations → Cron untuk melihat job dan riwayatnya. Query baca
berikut dapat dipakai oleh operator basis data yang berizin:

```sql
-- Tinjau status job dan kegagalan terbaru; jam ditampilkan dalam WIB.
SELECT j.jobname, j.schedule, j.active, r.status,
       r.start_time AT TIME ZONE 'Asia/Jakarta' AS mulai_wib,
       r.end_time AT TIME ZONE 'Asia/Jakarta' AS selesai_wib,
       r.return_message
FROM cron.job AS j
LEFT JOIN cron.job_run_details AS r ON r.jobid = j.jobid
WHERE j.jobname = 'inventory-month-close'
ORDER BY r.start_time DESC NULLS LAST
LIMIT 35;

-- Penanda untuk cutoff terakhir yang telah dicapai dalam kalender WIB.
WITH expected AS (
  SELECT date_trunc('month', clock_timestamp() AT TIME ZONE 'Asia/Jakarta')
         AT TIME ZONE 'Asia/Jakarta' AS cutoff
)
SELECT expected.cutoff AT TIME ZONE 'Asia/Jakarta' AS cutoff_wib,
       c."closedAt" AT TIME ZONE 'Asia/Jakarta' AS selesai_wib,
       c."cutoff" IS NOT NULL AS penanda_tersedia
FROM expected
LEFT JOIN public."pos_inventory_valuation_v2_closures" AS c
  ON c."cutoff" = expected.cutoff;
```

Status `succeeded` pada hari biasa hanya berarti job selesai tanpa kesalahan;
itu bukan bukti bahwa penutupan akhir bulan terjadi. Penanda yang tersedia
membuktikan transaksi penutupan untuk cutoff tersebut berhasil commit, tetapi
tidak menjamin nilai inventaris tersedia jika saldo dasar atau data grup
bermasalah. Penanda yang tidak ada menandakan penutupan otomatis untuk cutoff
tersebut belum terbukti dan perlu diselidiki; saldo historis untuk cutoff itu
ditampilkan belum tersedia. Pada bulan saat migrasi
atau jadwal baru dipasang setelah cutoff, penanda untuk cutoff sebelumnya
memang tidak dapat diharapkan.

Jika job gagal atau penanda tidak ada, periksa waktu mulai/selesai dan pesan
job, status proyek, zona waktu, hak akses, serta konflik lock. Catat insiden
dan beri tahu penanggung jawab laporan. Jangan menganggap menjalankan job
setelah cutoff akan memulihkan bukti batas yang terlewat. Nilai periode yang
tidak dapat dibuktikan tetap belum tersedia; selesaikan penyebabnya agar
penutupan berikutnya dapat berjalan. Pemantauan ini adalah tugas operasional:
keberadaan tabel penanda tidak berarti alert otomatis sudah disiapkan.

## Migrasi, pemulihan, dan rollback

Migrasi saldo dasar membatasi waktu tunggu lock awal hingga 500 ms. Jika ada
penulisan inventaris yang sedang berjalan, migrasi dapat gagal dan harus
diperiksa serta dicoba kembali setelah penulisan selesai. Jangan menganggap
migrasi yang gagal telah menghasilkan saldo dasar.

Pulihkan produk, grup stok, ledger, dan penanda dari cadangan yang konsisten.
`TRUNCATE`, penonaktifan trigger, atau pemulihan sebagian dapat melewati
pencatatan perubahan; selidiki dan pulihkan data secara konsisten sebelum
memercayai laporan. Jangan membuat penanda historis secara manual.
Ledger versi lama dipertahankan untuk kompatibilitas rollback aplikasi, tetapi
perhitungannya tidak menjamin nilai grup stok yang benar dan tidak boleh
dianggap sebagai pengganti saldo inventaris baru yang tervalidasi.

## Kapasitas, retensi, dan Free Plan

Periksa pemakaian dan batas paket Supabase yang berlaku untuk setiap proyek.
Job harian menambah riwayat pelaksanaan; riwayat perubahan inventaris dan
penanda juga memakai penyimpanan basis data. Pantau ukuran, CPU, memori, dan
durasi job, serta tetapkan retensi riwayat job sesuai kebutuhan audit. Jangan
menghapus riwayat valuasi yang masih diperlukan untuk laporan historis.

Supabase dapat menjeda proyek Free yang aktivitasnya rendah. Proyek yang
terjeda atau kehabisan kapasitas dapat melewatkan penutupan; keberadaan Cron
tidak menjamin proyek tetap aktif atau berhasil berjalan. Periksa status proyek,
kuota, kebijakan paket, dan opsi pemulihan secara berkala. Batas dan biaya
dapat berubah, sehingga jangan menganggap rancangan ini menjamin penggunaan
gratis atau ketersediaan layanan.

Referensi: [Supabase Cron](https://supabase.com/docs/guides/cron),
[pemakaian Supabase](https://supabase.com/docs/guides/platform/manage-your-usage),
dan [penjedaan proyek Free](https://supabase.com/docs/guides/platform/free-project-pausing).
