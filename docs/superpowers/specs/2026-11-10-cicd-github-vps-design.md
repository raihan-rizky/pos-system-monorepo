# Desain CI/CD GitHub Actions dan VPS - 2026-11-10

Status: rancangan untuk persetujuan. Branch `dev` sudah dibuat atas permintaan pengguna; workflow, SSH deployment, service, dan cleanup otomatis belum diubah oleh pekerjaan ini.

## Tujuan dan keputusan pengguna

- Setiap push ke `main` memicu pemeriksaan, build, lalu deployment otomatis ke produksi `https://teladanpos.biz.id`.
- Setiap push ke `dev` memicu alur yang sama ke development `https://app-teladan-pos-84d9ee-dev.abyte.my.id`.
- Pengguna memilih GitHub Actions menghubungi VPS melalui SSH terbatas. Build tetap di GitHub, aplikasi tetap native dengan Nginx/systemd, tanpa Coolify.
- Branch `dev` dibuat dari `main` pada commit `a38e7de6274d5582c3b426947237e71b30d9942d`, sudah diverifikasi di GitHub pada 10 November 2026 WIB.
- Kebijakan retensi yang telah diminta adalah tiga hari. Desain ini mengusulkan penerapan seragam 72 jam untuk artefak deployment dan slot rollback kedua lingkungan agar sederhana dan hemat disk. Ini memperbarui usulan terdahulu yang mempertahankan dev tujuh hari.

Keberhasilan berarti push pada branch yang sesuai dapat memperbarui aplikasi tanpa SSH manual, perubahan gagal tidak dipromosikan, dan versi sehat dapat dipulihkan tanpa mengembalikan transaksi database.

## Pendekatan yang dipertimbangkan

1. **GitHub Actions ke SSH terbatas, dipilih pengguna.** Langsung memicu pemasangan setelah CI sukses; memakai layanan VPS yang sudah ada. Memerlukan kunci khusus deployment dan verifikasi host SSH.
2. VPS memeriksa GitHub berkala. Tidak perlu kunci SSH di GitHub, tetapi menambah polling, pengelolaan token, dan jeda deployment. Tidak dipilih.

Docker/Coolify tidak termasuk perubahan ini karena pengguna memilih mempertahankan deployment native.

## Kondisi awal yang harus dipertahankan

- Repository privat: `raihan-rizky/pos-system-monorepo`. GitHub Actions aktif.
- `main` dan `dev` belum memiliki builder VPS. Baseline committed `9d70d25b81e0ec24161e7201b1fb2881237fc0aa` berada 17 commit di depan `main`; perbedaannya mencakup builder, packaging, font lokal, dan perbaikan keamanan clear-locks. Baseline ini harus diintegrasikan dan diuji sebelum auto-deploy diaktifkan.
- Checkout saat ini memuat perubahan auth, WhatsApp, AI, dan keuangan yang belum committed. Perubahan tersebut tidak boleh ikut distage, dimerge, atau dideploy oleh pekerjaan CI/CD ini.
- Web/worker produksi: `pos-web`, `pos-import-worker`. Web/worker dev: `posdev-web`, `posdev-import-worker`. Web mendengarkan pada loopback 3000 dan 3001.
- Nginx produksi menerima port 80. Nginx dev menerima `10.10.0.149:3000` dan meneruskan ke loopback 3001. Gateway lokal produksi/dev memakai 28000/18000. Pemeriksaan dev tidak boleh diarahkan ke listener produksi hanya dengan mengganti header Host.
- Environment runtime tetap di `/etc/pos-system/production.env` dan `development.env`. Database/Auth/PostgREST/Realtime lokal serta Cloudflare R2 tetap memakai layanan dan pemisahan prod/dev sekarang.
- Setelah cleanup manual yang diminta pengguna, hanya dua release aktif yang tersisa di `/srv/pos-system/releases`, dengan sekitar 7,2 GiB kosong. Belum ada rollback lokal terverifikasi. Tiga arsip unduhan lama masih ada di `/srv/pos-system/artifacts`.
- Worker saat ini memiliki timeout stop 90 detik dan SIGKILL bawaan systemd aktif. Pengaturan ini perlu disesuaikan untuk drain yang aman.

## Bentuk paling sederhana

Gunakan dua workflow dan satu pengelola release dengan dependensi minimal, tanpa deployment platform baru atau daemon yang selalu berjalan:

1. **POS CI:** menggantikan workflow CI/build lama yang tumpang tindih. Dipicu PR menuju `main`/`dev`, push ke kedua branch, dan permintaan build manual yang dibatasi ke branch tersebut.
2. **POS Deploy:** dipicu ketika run POS CI selesai sukses; juga menyediakan `workflow_dispatch` untuk deploy ulang dan rollback. Hanya push/build manual terverifikasi dari repository sendiri dan branch yang sesuai yang layak dideploy. PR tidak pernah dideploy.
3. **Pengelola release VPS:** helper root-owned untuk validasi, download/staging, pengalihan service, rollback, status, dan cleanup. Operasi berjalan sebagai tugas systemd persisten dengan journal kecil, bukan proses yang hilang ketika SSH putus. Nama file dan subcommand ditentukan pembuat rencana.

`workflow_run` dipilih agar run CI pembuat artefak sudah benar-benar sukses sebelum run deployment memiliki akses SSH. Workflow deploy dibaca dari default branch `main`, dan tidak menjalankan source atau script kandidat di job yang memiliki kunci SSH.

## Pemeriksaan dan build di GitHub

- Instal dependency memakai lockfile, Node 22, dan pnpm 10.24.0; generate Prisma Client.
- Jalankan pemeriksaan TypeScript/lint, unit test, tes keamanan clear-locks, tes packaging/deployment, dan E2E Chromium yang sudah ada. Jangan menggandakan lint bila isinya sama dengan type-check. Kegagalan pemeriksaan wajib menghentikan jalur deploy; tidak menonaktifkan tes untuk mengejar status hijau.
- CI memakai URL database dummy/layanan PostgreSQL sementara bila tes integrasi membutuhkannya. Hapus pemakaian secret database, service-role, WhatsApp, dan kredensial bisnis dari job CI lama. Tidak ada tes yang mengakses database produksi/dev live.
- E2E memakai mock dan bypass yang sudah disediakan konfigurasi tes; flag bypass dan hasil `.next-e2e` tidak boleh masuk artefak runtime. Hasil E2E bukan pembuktian login nyata ke layanan live.
- Build Next.js produksi dilakukan di runner GitHub. Tidak menjalankan build di checkout interaktif atau VPS.
- Push `main` membangun target prod; push `dev` membangun target dev. URL Auth, fingerprint kunci publik, dan URL media harus sesuai lingkungan karena konfigurasi publik dibekukan dalam JavaScript. Build PR memakai konfigurasi dummy dan tidak menghasilkan artefak yang layak dideploy.
- Gunakan packaging native yang sudah diuji: runtime tar.gz, metadata, checksum, commit SHA penuh, build ID, target, workflow/run/artifact ID, waktu build/upload, fingerprint konfigurasi publik, dan hash schema aplikasi. File environment, private key, log, cache, serta credential tidak ikut paket.
- Artefak diberi identitas run/target yang tidak berubah; tidak memakai pilihan ambigu seperti artefak bernama latest. Artefak runtime baru memakai `retention-days: 3`. Laporan tes boleh memiliki kebijakan terpisah yang ditulis di runbook.

## Deployment dan akses SSH

- Job Deploy memetakan `main` ke prod dan `dev` ke dev dari metadata run CI, bukan dari input target yang dapat mengganti arti branch. Verifikasi repository asal, event CI, workflow ID/path, branch, SHA, kesuksesan run, target, dan artifact ID.
- Gunakan akun/kunci khusus deployment, bukan kunci login root pribadi. Matikan forwarding dan batasi perintah SSH ke helper root-owned yang menyediakan operasi deployment saja. Helper memvalidasi pemetaan branch/lingkungan di sisi VPS juga.
- Simpan kunci deployment di GitHub Actions secrets; gunakan GitHub Environments jika fitur akun mendukung pembatasan branch yang dibutuhkan. Jangan menggantungkan desain pada fitur berbayar yang belum tersedia. `known_hosts` dipasang dari host key VPS yang sudah diverifikasi; jangan memakai StrictHostKeyChecking=no atau mempercayai hasil scan saat koneksi pertama tanpa pembanding.
- Kunci produksi tidak disediakan ke job PR/build. Job deploy hanya mendapat izin GitHub yang diperlukan. Tidak ada shell command atau URL unduhan bebas dari input operator/artifact yang diteruskan sebagai perintah root.
- SSH membawa identitas run/artifact dan permintaan operasi. VPS mengunduh artefak dari repository tetap melalui akses `gh` yang sudah tersedia; akses tersebut tetap di VPS dan tidak dikirim ke runner atau dicatat dalam journal. Jika akses baca artefak tidak tersedia, hentikan deploy dan laporkan; jangan membuat PAT baru secara diam-diam.
- Build lama yang kalah oleh push baru tidak boleh menggantikan versi baru. Tepat sebelum promosi otomatis, cocokkan SHA kandidat dengan tip branch GitHub yang sekarang. Permintaan deploy otomatis yang sama bersifat idempoten.
- Build boleh membatalkan build lama pada branch yang sama. Deployment memakai concurrency per lingkungan dengan `cancel-in-progress: false`, ditambah satu lock VPS bersama prod/dev/cleanup. Jangan membatalkan proses yang sudah menghentikan worker atau mengalihkan service.

## Urutan pemasangan dan pemulihan

1. Ambil lock dan rekonsiliasi state dengan WorkingDirectory service yang benar-benar dimuat, PID/proses hidup, dan journal. State setengah jalan dipulihkan sebelum operasi baru.
2. Ukur kebutuhan ZIP/arsip/runtime kandidat. Usulan batas awal: minimal 4 GiB kosong sebelum staging dan minimal 1 GiB tersisa sesudah staging; gunakan kebutuhan terhitung yang lebih besar bila kandidat membesar. Cleanup yang aman boleh mendahului staging, tetapi tidak mengorbankan release terlindungi.
3. Verifikasi provenance, umur artefak, checksum, manifest, path arsip, dan symlink. Ekstraksi tidak boleh menimpa release aktif atau menulis keluar direktori staging. Verifikasi dependency, Prisma, dan konfigurasi publik sesuai lingkungan.
4. Jalankan canary baca-saja di loopback terpisah yang tidak mengonsumsi job worker: halaman login, aset JavaScript, Auth gateway lingkungan yang benar, dan Prisma SELECT 1. Gunakan database dan environment runtime yang berlaku; jangan membuat transaksi, menjalankan seed, atau memakai password pegawai.
5. Simpan journal, lalu hentikan worker lama secara kooperatif. Sesuaikan unit worker agar systemd tidak mengirim SIGKILL; batas keputusan helper adalah 120 detik. Bila worker belum berhenti aman, batalkan promosi sebelum web dialihkan, lindungi path yang terkait, dan tugas pemulihan persisten menunggu worker selesai lalu menghidupkan kembali worker lama. Jangan menganggap timeout berarti proses sudah mati.
6. Alihkan web dan worker ke release yang sama. Restart singkat web diperbolehkan; zero downtime tidak dijanjikan. Jalankan readiness maksimal 60 detik, periksa worker aktif, dan lakukan smoke check lewat URL publik prod/dev yang benar.
7. Jika sukses, catat aktivasi, jadikan release sehat sebelumnya satu slot rollback lokal, hapus slot lama hanya sesuai aturan retensi/provenance, lalu cleanup aman.
8. Jika gagal, pulihkan web/worker sebelumnya dengan environment yang berlaku hanya jika database dan konfigurasi kompatibel. Catat build gagal agar tidak dicoba ulang otomatis oleh event duplikat. Jika kompatibilitas tidak dapat dibuktikan, hentikan pemulihan otomatis dan laporkan; jangan restore database atau berulang kali restart.

## Rollback manual dan perubahan database

- Tombol Run workflow menyediakan pilihan deploy ulang atau rollback, lingkungan, dan identitas run/build yang eksplisit. Target harus berasal dari run CI sukses, branch yang benar, dan jendela retensi yang masih berlaku; tidak menerima SHA/ref bebas untuk melewati pemeriksaan.
- Rollback memakai satu release lokal sehat yang belum kedaluwarsa, atau mengunduh ulang artefak kompatibel yang masih tersedia. Tidak menjanjikan pemulihan versi yang artefaknya sudah habis. Kandidat gagal tidak otomatis menjadi slot rollback berikutnya.
- Rollback eksplisit mencatat blok terhadap versi bermasalah agar event otomatis yang sudah antre tidak langsung memasangnya lagi. Push dengan SHA baru yang lolos CI atau deploy ulang eksplisit dapat melanjutkan sesuai runbook.
- Database, password, dan konfigurasi runtime tidak dikembalikan ke snapshot lama. Pipeline ini tidak menjalankan db:push, seed, reset, atau migrasi schema otomatis.
- Jika schema Prisma/migration yang dibutuhkan kandidat berbeda dari release aktif, tahan deployment dan laporkan bahwa migrasi terpisah perlu disiapkan/ditinjau. Ini usulan batas untuk tahap pertama, bukan migrasi database yang sudah diotorisasi. Perubahan database terpisah harus kompatibel dengan versi yang akan dideploy dan versi rollback.

## Cleanup 72 jam dan batas disk

- Release aktif selalu dilindungi tanpa batas umur. Perlindungan nyata dari empat service/proses mengalahkan registry.
- Maksimal satu rollback lokal terverifikasi per lingkungan, berlaku 72 jam sejak release berhenti aktif. Artefak remote berlaku 72 jam sejak upload. Dua waktu tersebut dibedakan dalam state dan laporan.
- Runtime nonaktif lain boleh dibersihkan selama 72 jam hanya bila arsip penggantinya telah diverifikasi tersedia. Runtime kedaluwarsa boleh dibersihkan tanpa arsip remote, kecuali masih aktif, rollback terlindungi, atau dipakai operasi yang belum selesai.
- Arsip unduhan duplikat boleh dibersihkan sesudah release aktif/rollback dan keberadaan remote terverifikasi. Kandidat/transfer gagal yang tidak in-flight dibersihkan setelah 24 jam. Build gagal tidak pernah menaikkan status dirinya menjadi rollback sehat.
- Satu timer systemd setiap jam dan cleanup sesudah operasi sukses memakai lock yang sama, dry-run, allowlist direktori, dan audit log tanpa secret. Registry rusak, umur tidak diketahui, symlink keluar, atau file legacy tidak dikenal menyebabkan penghapusan dilewati dan dilaporkan.
- Jangan menjalankan Docker prune atau membersihkan database volumes, backup, media R2, environment, source operator, atau direktori selain release/artefak/staging yang tercatat.
- Retensi GitHub tiga hari berlaku untuk upload baru; artefak lama tujuh hari tidak berubah otomatis. Inventarisasi dan pruning satu kali boleh menyasar artefak deployment lama yang sudah lebih dari 72 jam, dengan daftar ID/repo/workflow/target yang eksplisit dan pemeriksaan sebelum delete. Jangan menghapus laporan tes atau artefak lain hanya berdasarkan umur.
- Implementasi mengadopsi pengamanan dari desain retensi 2026-11-09. Dokumen ini mengganti keputusan manual-only, cakupan prod-only, dan dev tujuh hari pada desain lama jika disetujui.

## Aktivasi awal tanpa mencampur pekerjaan lain

1. Selesaikan/review hanya baseline committed VPS dan perubahan CI/CD; pertahankan seluruh perubahan lokal lain. Gunakan PR/merge biasa tanpa force-push dan jangan mengaktifkan deployment dari branch `codex/*`.
2. Instal helper/keys/registry dengan mode dry-run; daftarkan kedua release aktif sebagai baseline sehat setelah pemeriksaan. Bootstrap tidak boleh menganggap release lama yang sudah dihapus masih tersedia untuk rollback.
3. Gabungkan workflow ke `main` dengan variabel repo `AUTO_DEPLOY_ENABLED=false`. Ini membuat handler workflow_run tersedia di default branch tanpa langsung mengganti produksi. Sinkronkan perubahan CI/CD dari `main` ke `dev` tanpa mengubah keputusan awal bahwa dev dibuat dari main.
4. Tunggu CI sukses pada masing-masing branch. Uji jalur manual dengan artefak dev terlebih dahulu, termasuk kegagalan/rollback yang diuji dengan service palsu sebelum menyentuh layanan live. Jangan merusak aplikasi live untuk mendemonstrasikan kegagalan.
5. Jalankan deployment produksi pertama dari artefak prod yang lolos CI dan lakukan pemeriksaan baca-saja. Setelah kedua lingkungan terbukti sehat, aktifkan AUTO_DEPLOY_ENABLED; push selanjutnya mengikuti pemetaan branch secara otomatis. Tombol manual tetap tersedia.

## Hasil yang dapat diperiksa dan kriteria penerimaan

- Dua workflow, helper deployment/retensi dengan tes, unit/timer dan konfigurasi SSH terbatas, serta runbook Indonesian di folder dokumentasi C: yang telah disetujui. Tidak perlu mengubah Bantuan/AI workflow/changelog produk karena tidak ada alur fitur pengguna aplikasi yang berubah.
- TDD mencakup pemetaan branch, penolakan PR/fork, provenance/target/config/checksum, arsip berbahaya, batas 72 jam, perlindungan aktif/rollback/in-flight, disk tidak cukup, job duplikat/terlambat, worker tidak selesai, kegagalan aktivasi, dan pemulihan journal. Pengujian pengalihan memakai filesystem sementara dan adapter service palsu sebelum VPS.
- PR hanya memeriksa kode. Push main/dev yang lolos CI memperbarui lingkungan yang benar, web dan worker memakai build yang sama. Kegagalan CI atau SHA tertinggal tidak mengubah layanan.
- Status/journal/GitHub summary menunjukkan branch, lingkungan, commit, build/run, tahap operasi, hasil readiness, slot rollback/masa berlakunya, ruang disk, dan hasil cleanup. Tidak ada credential atau password di artefak, ringkasan, atau log.
- Verifikasi VPS mencakup service/PID/path, URL publik prod/dev beserta asetnya, Auth, koneksi database baca-saja, dan perlindungan media/backup. Readiness ini tidak mengklaim seluruh fitur bisnis sudah diuji pada data live.
- Nama helper, bentuk journal, port canary loopback, teknik validasi arsip, serta cara menulis tes boleh ditentukan pembuat rencana menggunakan tooling yang sudah ada. Hindari framework deployment dan dependency baru yang tidak diperlukan.

## Catatan eksekusi desain

Headroom stats telah dipanggil. Proxy kompresi Headroom tidak terjangkau; sempat tool MCP tidak tersedia lalu tersedia kembali. Inspeksi dibatasi, dan credential tidak dikirim ke kompresor. GitNexus query dicoba: FTS tidak tersedia dan tidak menemukan flow packaging; pembacaan sumber dilakukan secara terbatas. Belum ada simbol aplikasi yang diedit.
