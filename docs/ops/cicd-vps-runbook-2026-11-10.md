# Panduan CI/CD VPS - 2026-11-10

Status pemasangan: sedang diverifikasi; bagian hasil aktual diisi setelah aktivasi selesai.

## Pemakaian harian

- Push/merge ke `dev` menjalankan POS CI, lalu POS Deploy memperbarui development setelah pemeriksaan berhasil.
- Push/merge ke `main` melakukan hal yang sama untuk produksi. Pipeline tidak melakukan merge otomatis antarbranch.
- PR menjalankan pemeriksaan dengan data mock dan tidak mengakses SSH, database toko, atau credential layanan bisnis.
- Tes gagal berarti deployment tidak dilanjutkan. Buka langkah yang gagal di tab Actions; jangan mengulang deployment dari artefak lain tanpa memeriksa identitas run.

## Deploy ulang lewat tombol

1. Buka GitHub Actions, pilih **POS Deploy**, lalu **Run workflow** dengan branch workflow **main**.
2. Pilih `deploy` dan lingkungan `dev` atau `prod`. Masukkan ID numerik run **POS CI** yang sukses pada branch lingkungan tersebut.
3. Tunggu hasil operasi VPS di summary. Client menunggu maksimal 20 menit; jika runner terputus, periksa operasi VPS sebelum mencoba ulang karena proses di VPS tetap persisten.

## Rollback

1. Buka **POS Deploy → Run workflow**, tetap gunakan workflow dari `main`.
2. Pilih `rollback` dan lingkungan. Kosongkan Run ID untuk memilih satu slot rollback lokal sehat; isi Run ID jika hendak memakai arsip kompatibel dari CI yang masih tersedia.
3. Periksa hasil readiness, versi aktif, dan slot rollback pada summary. Rollback tidak mengembalikan transaksi atau password database. Versi yang ditinggalkan diblokir dari event deployment otomatis duplikat.

Rollback lokal berlaku 72 jam sejak versi berhenti aktif; arsip GitHub berlaku 72 jam sejak upload. Release aktif tidak dihapus karena umur. Bila tidak ada versi kompatibel yang masih tersedia, pipeline menolak rollback dan memberi alasan.

## Perubahan schema

Pipeline tidak menjalankan `db:push`, seed, reset, atau migrasi otomatis. Perubahan hash schema aplikasi atau fingerprint struktur database menahan deploy. Siapkan migrasi terpisah yang sudah ditinjau dan kompatibel dengan versi aplikasi/rollback sebelum memperbarui baseline deployment. Jangan mengedit registry untuk menyamarkan perubahan schema.

## Pengelolaan VPS

Helper root-owned berada di `/usr/local/lib/pos-deploy/`, entrypoint `/usr/local/sbin/pos-release`, registry `/var/lib/pos-system-deploy/state.json`, operasi `/var/lib/pos-system-deploy/jobs/`. Konfigurasi noncredential helper di `/etc/pos-system/deploy.json`; environment aplikasi tetap di `/etc/pos-system/`.

```bash
pos-release status
pos-release cleanup
pos-release cleanup --apply
systemctl status pos-deploy-cleanup.timer pos-deploy-recover.timer
journalctl -u 'pos-deploy-*' --since today
```

Cleanup tanpa `--apply` hanya menampilkan rencana. Cleanup setiap jam dan setelah deploy sukses berbagi lock dengan deployment. Database volumes, backup, media R2, environment, dan folder yang tidak tercatat dibiarkan.

Worker berhenti pada batas pemrosesan yang aman. Jika belum selesai dalam 120 detik, promosi dibatalkan sebelum web diganti; timer recovery menunggu worker berhenti lalu menghidupkan worker lama. Jangan mematikan proses worker dengan SIGKILL untuk mempercepat deployment.

## Variabel dan secret Actions

- `AUTO_DEPLOY_ENABLED`: `false` selama bootstrap; `true` setelah kedua lingkungan lolos verifikasi.
- Variabel `POS_VPS_HOST`, `POS_VPS_PORT`, `POS_VPS_PROD_PUBLIC_AUTH_URL`, `POS_VPS_DEV_PUBLIC_AUTH_URL`, `POS_VPS_PROD_R2_PUBLIC_BASE_URL`, `POS_VPS_DEV_R2_PUBLIC_BASE_URL`.
- Secret `POS_VPS_PROD_PUBLIC_SUPABASE_ANON_KEY` dan `POS_VPS_DEV_PUBLIC_SUPABASE_ANON_KEY` hanya berisi kunci publik sesuai build target.
- Secret SSH `POS_VPS_PROD_DEPLOY_KEY`, `POS_VPS_DEV_DEPLOY_KEY`, dan host key terverifikasi `POS_VPS_KNOWN_HOSTS`. Kunci SSH masing-masing hanya dapat memanggil helper untuk satu lingkungan; bukan kunci login root pribadi.

Jika key/URL publik berubah, bangun ulang runtime sesuai target karena nilainya dibekukan dalam JavaScript. Jangan mengembalikan environment lama saat rollback. Jika kapasitas kurang dari batas staging, cleanup dry-run lebih dahulu; jangan menghapus release aktif/rollback terlindungi untuk memaksa deployment.

## Hasil verifikasi aktual

Belum diisi: run CI, deployment dev/prod, pembuktian push otomatis, kapasitas akhir, timer, dan identitas release aktif.
