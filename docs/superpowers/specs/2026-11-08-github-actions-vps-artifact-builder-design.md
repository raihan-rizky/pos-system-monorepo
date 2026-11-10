# Desain Builder Artefak VPS melalui GitHub Actions

## Intent

Build Next.js di VPS 2 vCPU/4 GB berhenti karena tekanan memori dan I/O. Runner `ubuntu-latest` GitHub Actions sudah menyelesaikan gate produksi untuk commit `a38e7de` dalam 9m52s, sehingga runner itu dipakai untuk menghasilkan artefak yang dapat dipasang ke VPS tanpa kompilasi ulang di VPS.

## Goals

- Menerima ref/commit yang dipilih secara manual.
- Menjalankan install, Prisma generate, dan build dengan database CI lokal/dummy tanpa migrasi database produksi.
- Membangun artefak dev dengan URL dan anon key gateway lokal dev yang benar karena Next.js menanam `NEXT_PUBLIC_*` pada saat build.
- Mengemas output web yang diperlukan, file publik, metadata commit, dan checksum.
- Menyimpan artefak dengan retensi terbatas agar dapat diunduh lalu dipasang ke release VPS.
- Memvalidasi artefak sebelum pengalihan service dan menjaga rollback ke release aktif.

## Non-goals

- Tidak merotasi password database pada pekerjaan ini.
- Tidak mengubah DNS, alias publik, service aktif, atau database produksi saat builder dijalankan.
- Tidak memindahkan gambar dari Cloudflare R2.
- Tidak menjadikan GitHub Actions sebagai runtime aplikasi.

## Constraints

- Repository tetap private dan artefak berisi kode hasil kompilasi, jadi akses tetap dibatasi melalui GitHub.
- Workflow tidak boleh menjalankan `db:migrate:prod` atau memakai kredensial produksi.
- VPS hanya memiliki sekitar 7 GB ruang kosong; paket harus berisi output runtime yang diperlukan dan memiliki checksum sebelum transfer.
- Aplikasi berjalan dari struktur monorepo dengan symlink pnpm. Paket harus mempertahankan layout itu dan generated Prisma Client yang cocok dengan schema commit.
- Kunci anon dev adalah informasi publik yang ditanam ke browser. Workflow mengambilnya dari GitHub Actions secret, sedangkan password database dan service-role key tidak dipakai.

## Approaches considered

1. **GitHub Actions artefak — dipilih.** Runner yang sudah terbukti, private-repo access tetap di GitHub, dan hasil dapat diberi checksum sebelum dipasang. Trade-off: perlu workflow baru dan satu langkah download/transfer manual.
2. **Vercel build lalu ekspor.** Runner besar tersedia, tetapi output kompilasi tidak tersedia sebagai artefak biasa; perlu jalur upload tambahan dan pengelolaan kredensial penyimpanan. Risiko operasional lebih tinggi.
3. **Builder VPS sementara yang lebih besar.** Secara teknis sederhana, tetapi menambah biaya, provisioning, dan pekerjaan pembersihan. Vercel Sandbox juga tidak tersedia pada paket saat ini (`payment_required`).

## Chosen design

Tambahkan workflow `vps-artifact.yml` yang saat ini membangun target dev dan berjalan manual atau saat push ke branch khusus yang sedang dipakai:

1. Checkout ref yang dipilih.
2. Setup pnpm 10.24.0 dan Node 22.
3. Install dengan lockfile.
4. Jalankan `pnpm db:generate` dan `pnpm exec turbo run build` memakai URL PostgreSQL dummy CI dan konfigurasi gateway Auth/API lokal dev yang sebenarnya.
5. Kemas output web, aset publik, dependency pnpm beserta generated Prisma Client, dokumentasi AI runtime, metadata commit, dan checksum SHA-256; kecualikan cache build, file environment, dan log.
6. Ekstrak ulang arsip di runner, verifikasi schema Prisma, jalankan Next pada loopback, lalu uji `/login` dan satu aset statis sebelum upload dengan retensi tujuh hari.

Target produksi harus mendapat build sendiri memakai gateway dan konfigurasi publik produksi yang benar setelah gateway tersebut siap. Artefak dev tidak boleh dipakai untuk produksi.

Di VPS, artefak akan diekstrak ke release baru, checksum diverifikasi, lalu service kandidat dijalankan secara loopback. Hanya setelah `BUILD_ID`, halaman `/login`, aset statis, dan koneksi ke gateway Auth/API lokal lulus, symlink/service dapat dipindahkan. Release aktif tetap menjadi rollback target.

## Verification and rollback

- CI: workflow selesai `success`, `BUILD_ID` ada, checksum cocok, dan tidak ada langkah migrasi produksi.
- VPS: uji HTTP loopback dan health check; pastikan service aktif dan URL publik lama tetap 200 selama uji.
- Rollback: hentikan kandidat, kembalikan symlink/release sebelumnya, dan start service aktif; artefak CI tidak mengubah database.

## Builder handoff

Setelah workflow pertama sukses, catat run ID, commit SHA, ukuran arsip, checksum, dan daftar file release dalam catatan migrasi. Deployment produksi tetap menunggu pemeriksaan kapasitas dan validasi aplikasi lengkap.
