# Desain retensi deployment dan rollback — 2026-11-09

Status: rancangan untuk ditinjau; belum mengubah workflow, layanan, timer, atau file release VPS.

## Tujuan dan keputusan pengguna

Pengguna memilih jendela **3 hari** dan pendekatan **gabungan VPS + GitHub**: VPS menyimpan release aktif serta satu rollback lokal yang terverifikasi; riwayat build lain tersedia sebagai artefak GitHub dalam jendela retensi. Tujuannya menyediakan pemulihan aplikasi sekaligus membatasi pertumbuhan disk. Rollback aplikasi mempertahankan data transaksi yang sudah masuk.

## Konteks yang diverifikasi

- Build berjalan di GitHub Actions melalui `.github/workflows/vps-artifact.yml`; pemasangan dan pengalihan web/worker dilakukan lewat SSH/systemd. Retensi artefak saat ini tujuh hari.
- VPS memiliki disk 25 GiB dengan ruang kosong sekitar 2,3 GiB, tujuh direktori release, dan belum ada timer pembersihan deployment khusus. Runtime terpasang sekitar 1,3 GB dan arsip sekitar 400 MB; staging juga dapat memakai ZIP unduhan.
- Empat service berjalan: `pos-web`, `pos-import-worker`, `posdev-web`, dan `posdev-import-worker`. Release aktif harus ditentukan dari konfigurasi service yang benar-benar dimuat, bukan hanya registry atau nama folder.
- Release produksi aktif memakai build `ox_mZEdXiqmK5q0idi4Yk`, ref aplikasi `8d7226ff17890be7c5f1b173dc7c6485e0d5299c`, dan URL Auth `https://teladanpos.biz.id/supabase`. Release sebelumnya memakai SHA aplikasi sama tetapi domain Auth berbeda.
- Metadata paket sudah memiliki target, commit aplikasi, build ID, URL Auth publik, fingerprint kunci publik, waktu build, dan checksum arsip. File environment serta log dikecualikan dari paket.

## Pendekatan yang dipertimbangkan

1. Menyimpan seluruh runtime tiga hari di VPS: seluruh rollback lokal cepat, tetapi penggunaan disk bertambah sekitar 1,3 GB per build.
2. **Gabungan VPS + GitHub, dipilih pengguna**: satu runtime aktif dan satu rollback lokal; build lain diambil ulang dari GitHub bila masih tersedia. Pemulihan versi selain rollback lokal memerlukan unduhan dan staging.

## Ruang lingkup dan rincian yang diusulkan

Rincian berikut adalah pilihan rancangan, bukan keputusan tambahan yang sudah dinyatakan pengguna:

- Pelaksanaan pertama berfokus pada **produksi**, sesuai pertanyaan retensi yang dijawab pengguna. Retensi dev tetap tujuh hari; seluruh path aktif dev dilindungi dari cleanup produksi.
- Tiga hari berarti **72 jam berjalan**, dihitung dengan timestamp UTC. Antarmuka/laporan operator menampilkan WIB.
- Perlindungan release aktif tidak memiliki batas umur. Kebijakan file deployment ini tidak mengatur retensi data bisnis atau backup database.
- Tidak ada deployment otomatis dari GitHub ke VPS. Operator tetap memicu pemasangan/rollback; kontrol release menjadi jalur bersama untuk mencatat hasil, melindungi file, dan menjalankan retensi.

## Aturan retensi

| Objek | Aturan |
| --- | --- |
| Runtime produksi aktif | Selalu dipertahankan, termasuk saat umurnya lebih dari 72 jam. |
| Rollback lokal | Maksimal satu release nonaktif yang berhasil, kompatibel, dan terverifikasi; dipertahankan sampai 72 jam sejak terakhir digantikan sebagai release aktif. |
| Runtime nonaktif lain | Selama riwayat build masih dalam 72 jam, penghapusan runtime memerlukan arsip GitHub terverifikasi. Setelah jendela build berakhir dan umurnya dapat dibuktikan, runtime yang tidak dilindungi boleh dihapus walaupun arsip remote juga sudah kedaluwarsa. |
| Artefak GitHub produksi | Kedaluwarsa 72 jam sejak upload GitHub. Build lain dapat dipulihkan hanya selama artefaknya belum kedaluwarsa. |
| Arsip unduhan lokal lengkap | Cache sementara; dapat dihapus setelah ekstraksi, validasi, dan pencatatan metadata/integritas selesai. Bukan salinan backup permanen. |
| Unduhan parsial/kandidat gagal | Dilindungi selama operasi berlangsung. Sisa operasi yang benar-benar selesai/gagal dapat dibersihkan setelah 24 jam. |
| Metadata dan log operasi | Retensi 72 jam, dengan pengecualian metadata yang masih diperlukan oleh release aktif, rollback lokal, atau transaksi deployment yang belum selesai. Tidak memuat nilai secret. |

Jam retensi artefak GitHub dan rollback lokal sengaja berbeda: arsip GitHub dihitung sejak upload, sedangkan rollback langsung dihitung sejak penggantian release aktif. Dengan demikian, aplikasi yang stabil selama berminggu-minggu tetap dapat menjadi rollback lokal untuk deployment berikutnya. Ini tidak menjanjikan arsip seluruh release selama 72 jam setelah penonaktifan; pemulihan riwayat lainnya mengikuti masa tersedia artefak GitHub.

Slot rollback lokal boleh kosong bila tidak ada release yang memenuhi syarat. Versi dengan konfigurasi lama atau kunci yang sudah dirotasi tidak diberi label aman hanya untuk mengisi slot tersebut. Sebelum deployment baru, release aktif yang sehat menjadi calon rollback langsungnya.

## Identitas, metadata, dan kompatibilitas

- Identitas release membedakan environment, run/artifact ID GitHub, build ID, commit aplikasi, dan checksum arsip; commit saja bukan identitas unik.
- Registry root-owned, atomik dan berversi menyimpan path kanonis, waktu upload/aktivasi/penonaktifan, status, hasil pemeriksaan, fingerprint migrasi database, serta URL/fingerprint konfigurasi publik. Tidak menyimpan password, token sesi, atau isi environment.
- Bukti integritas runtime dibuat saat paket terverifikasi diadopsi. Hash file immutable dan symlink diperiksa lagi sebelum rollback; cache/log yang memang mutable dikecualikan secara terbatas. Checksum ini tetap tersedia setelah cache arsip unduhan dihapus.
- Rollback harus cocok dengan environment produksi, URL Auth, fingerprint kunci publik, serta fingerprint migrasi database yang tervalidasi. Ketidakcocokan atau bukti yang tidak lengkap membuat rollback ditolak dengan alasan yang jelas.
- Runtime selalu memakai environment/credential produksi yang berlaku. Rollback tidak memulihkan secret lama, konfigurasi Auth/DNS lama, skema database, atau snapshot transaksi.
- Perubahan skema database memerlukan pemeriksaan kompatibilitas terpisah. Pengelola release tidak menjalankan migrasi; rollback lintas fingerprint migrasi diblokir sampai kompatibilitasnya diverifikasi dalam pekerjaan terpisah.

## Deployment dan rollback

Pengelola release ringan dipasang sebagai tooling root-owned di VPS, menggunakan runtime/tooling yang sudah tersedia. Ia menyediakan pemeriksaan status, aktivasi release yang sudah distage, rollback eksplisit, dan perencanaan/penerapan retensi; tidak menambah layanan aplikasi atau menyimpan akses SSH di GitHub.

Pilihan rancangan untuk gangguan layanan mengikuti pola produksi yang sudah digunakan: restart singkat web diperbolehkan; zero downtime tidak termasuk pekerjaan ini. Pemeriksaan kesiapan setelah switch dibatasi 60 detik sebelum upaya pemulihan ke release sebelumnya yang kompatibel. Ini batas pemeriksaan, bukan janji SLA bahwa seluruh pemulihan selalu selesai dalam 60 detik.

Worker harus dihentikan secara kooperatif sebelum web dialihkan. Handler SIGTERM yang sudah ada mengakhiri pemrosesan pada batas chunk dan mengembalikan sisa job ke `PENDING`; baris yang sudah committed dipertahankan. Tidak mengirim pembatalan job atau SIGKILL paksa. Jika worker belum berhenti aman dalam 120 detik, batalkan promosi sebelum switch web, pertahankan release lama, dan pulihkan worker lama setelah ia mencapai batas aman. Status pemulihan tetap pending dan kedua path dilindungi sampai worker pulih. Pengelola harus memastikan kebijakan timeout systemd tidak melakukan kill paksa; operasi pemulihan berjalan persisten di VPS agar tidak hilang ketika SSH putus. Perilaku ini diuji dengan job in-flight dan timeout; tidak menambah mekanisme queue baru.

1. Ambil lock global deployment/cleanup dan rekonsiliasi registry dengan service serta proses yang berjalan. State parsial atau service web/worker yang menunjuk release berbeda harus dipulihkan dahulu.
2. Sebelum staging, ukur kebutuhan ZIP/arsip/runtime dengan margin. Pilihan awal: minimal 4 GiB ruang kosong sebelum staging dan minimal 1 GiB tersisa setelah staging; gunakan kebutuhan terhitung yang lebih besar bila ukuran kandidat meningkat. Cleanup aman boleh dijalankan lebih dulu, tetapi release yang dilindungi tidak dikorbankan untuk mengejar batas ruang.
3. Verifikasi provenance workflow/repo, target, checksum, identitas build, konfigurasi publik, keamanan path arsip, symlink, dependency, dan Prisma. Kandidat yang tidak lengkap tidak dapat dipromosikan.
4. Jalankan canary/readiness baca-saja: `/login`, aset JS, Auth gateway, serta koneksi Prisma. Tidak memakai password pegawai atau menulis transaksi untuk pemeriksaan otomatis. Readiness ini bukan pengganti seluruh pengujian fitur.
5. Simpan journal operasi sebelum pengalihan. Alihkan web dan worker ke release yang sama, jalankan readiness lagi, lalu catat aktivasi sukses dan release lama sebagai rollback lokal. Kandidat gagal tidak pernah menjadi rollback terverifikasi.
6. Jika aktivasi gagal dan fingerprint database tetap kompatibel, pulihkan target service sebelumnya dengan environment yang berlaku. Jika ada drift skema/konfigurasi, lindungi kedua release dan laporkan kebutuhan pemulihan; jangan mencoba restore database otomatis.
7. Rollback yang diminta operator memakai pemeriksaan yang sama. Bila target tidak ada lokal, unduh/resume artefak GitHub yang masih berlaku, verifikasi, lalu stage. Kegagalan unduhan, checksum, umur, atau kompatibilitas membatalkan pengalihan.
8. Sesudah sukses, jalankan perencanaan retensi ulang. Release yang ditinggalkan akibat rollback bermasalah tidak otomatis dianggap calon rollback sehat berikutnya.

Tooling menyatukan pencatatan dan pengalihan service agar cleanup tidak mengira suatu kandidat sudah tidak dipakai ketika deployment masih berlangsung. Perintah build, install dependency, seed, migrasi, dan siklus `pnpm dev` tidak termasuk di dalamnya.

## Pembersihan aman

- Default CLI adalah laporan/dry-run dengan daftar path, alasan dilindungi/dihapus, perkiraan ukuran, dan blocker. Penerapan menghitung ulang kondisi terkini; laporan lama bukan izin menghapus path yang sudah berubah.
- Hanya direktori produksi yang telah terdaftar dan dibuktikan berada di root release/artefak yang dikelola boleh dihapus. Validasi realpath, batas direktori, tipe file, symlink, dan keadaan service diulang sebelum penghapusan.
- Lindungi seluruh referensi aktif dari keempat service, proses/canary yang masih berjalan, kandidat/transfer aktif, rollback lokal yang belum kedaluwarsa, serta journal operasi yang belum selesai. Gunakan satu lock global karena prod/dev berbagi disk.
- Bila registry rusak, state tidak konsisten, umur tidak dapat dibuktikan, atau path meragukan, lewati penghapusan dan laporkan. Untuk riwayat yang masih berada dalam 72 jam, arsip pengganti harus terbukti tersedia sebelum runtime nonaktif dihapus. Untuk riwayat yang sudah kedaluwarsa, tidak perlu menahan runtime tanpa batas hanya karena arsip remote sudah hilang. Perlindungan aktif/rollback lokal/in-flight selalu didahulukan. Jangan memakai pembersihan berbasis pola nama folder saja atau Docker prune.
- Credential/configuration, Docker/database volumes, backup migrasi terenkripsi, media Cloudflare, file operator lain, direktori dev, dan file temporer yang tidak diketahui tidak termasuk target cleanup.
- Timer systemd berjalan setiap jam dan sesudah deployment/rollback sukses. Batas pemilihan rollback tetap tepat 72 jam; penghapusan fisik dapat menunggu siklus berikutnya atau lock dilepas. Timer tidak memicu deployment atau rollback.

## Retensi GitHub

- `retention-days` menjadi 3 untuk target produksi; dev tetap 7.
- Nilai baru tidak mengubah upload lama secara retroaktif. Pembersihan remote memproses hanya namespace artefak produksi milik workflow VPS pada repo yang sama, berdasarkan waktu upload provider dan identitas workflow; artefak lain tidak disentuh.
- Timer VPS dapat memakai GitHub CLI yang sudah terautentikasi untuk pemeriksaan/pruning terbatas tersebut, sehingga tidak bergantung pada cron GitHub di branch default. Tidak ada token baru di source, argumen command, atau log.
- Gangguan GitHub menghasilkan laporan dan percobaan berikutnya. Cleanup lokal atas riwayat yang masih dilindungi 72 jam dan bergantung pada arsip remote tidak dilanjutkan tanpa bukti yang memadai. Runtime kedaluwarsa yang umurnya sudah tercatat terpercaya tetap boleh dibersihkan sesuai aturan lokal. Release aktif/rollback lokal tetap tersedia saat jaringan bermasalah.

## Penerapan awal

- Inventaris/dry-run dilakukan sebelum penghapusan pertama. Bootstrap release aktif dari service yang benar-benar berjalan dan metadata/hasil pemeriksaan yang dapat dibuktikan.
- Release produksi lama dengan SHA sama tetapi domain Auth berbeda tidak langsung diangkat sebagai rollback kompatibel.
- Release historis yang memiliki metadata, arsip, serta provenance terverifikasi boleh diadopsi sebagai archived/nonaktif. Waktu adopsi tidak mengatur ulang umur artefak.
- Folder legacy yang tidak dapat dibuktikan identitas atau statusnya dikarantina dalam laporan, bukan dihapus otomatis. Kondisi ini dapat membatasi penghematan ruang awal; jika ruang masih di bawah ambang, deployment baru diblokir dengan daftar penyebabnya.
- Perubahan pertama tidak mengalihkan aplikasi ke versi baru, tidak menghapus file dev, dan tidak menjalankan rollback uji pada produksi. Hanya tooling/metadata/timer dan cleanup produksi yang sudah terbukti aman diterapkan setelah desain/rencana disetujui.

## Kriteria penerimaan

- Pengujian deterministik membuktikan batas 72 jam, pengecualian aktif, satu rollback lokal, kandidat gagal, interrupted download, serta perbedaan build dengan SHA yang sama.
- Pengujian penolakan mencakup path/symlink keluar root, metadata rusak, environment/kunci/migrasi tidak cocok, referensi live di luar registry, state web/worker berbeda, operasi bersamaan, dan ruang disk kurang.
- Pengujian membuktikan runtime kedaluwarsa tetap bisa dibersihkan ketika arsip remote juga kedaluwarsa, sedangkan release yang dilindungi tetap utuh. Worker in-flight berhenti pada chunk/checkpoint, tidak kehilangan baris committed, dan timeout tidak memaksa kill atau meninggalkan worker tanpa pemulihan.
- Remote pruning diuji terhadap artefak dev, workflow lain, repo lain, umur provider, pagination, dan kegagalan GitHub.
- Integrasi pengalihan/rollback diuji dengan runner service palsu dan filesystem sementara sebelum menyentuh VPS. Canaries dan perintah inspeksi VPS tetap baca-saja; tidak memerlukan akun pegawai.
- Setelah pemasangan, dry-run dan satu cleanup terbatas menunjukkan release aktif/proses/dev/backup/media tetap utuh. Empat service, URL produksi/dev, Auth, dan gambar publik tetap dapat diperiksa seperti sebelum perubahan.
- Status menampilkan slot rollback dan alasan ketidaktersediaannya, masa berlaku artefak, ruang disk, serta hasil cleanup. Tidak ada klaim semua versi dapat di-rollback bila artefaknya kedaluwarsa atau skemanya tidak kompatibel.

## Detail untuk pembuat rencana

Nama file/subcommand, format journal detail, format manifest integritas, batas timeout, dan bentuk tes dapat ditentukan mengikuti tooling repo yang ada. Pilih dependensi yang sudah tersedia atau standard library; jangan menambah framework deployment. Snapshot konfigurasi/credential dan backup data yang sudah ada dibiarkan di luar kebijakan ini.

Desain ditulis di folder dokumentasi C: yang telah disetujui, dengan salinan identik berversi di `docs/superpowers/specs/2026-11-09-deployment-rollback-retention-design.md` pada checkout tugas. Headroom stats dipanggil; proxy kompresi tidak terjangkau, sehingga output inspeksi dibatasi dan secret tidak dikirim ke kompresor. Review tidak mengakses credential; pembatasan Application Control pada kompresor reviewer ditangani dengan pembacaan dokumen yang dibatasi.
