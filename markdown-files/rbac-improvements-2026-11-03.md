# Perbaikan RBAC dan pengalaman pengguna

Tanggal: **2026-11-03 (Asia/Jakarta)**

## Ruang lingkup

Susunan halaman tetap memakai kartu role, matriks, pemilih modul, editor izin, dan review penyimpanan. Perubahan menambah penjelasan akses, melengkapi katalog, menyelaraskan tindakan Riwayat, serta memperbaiki penyimpanan dan verifikasi izin.

## Temuan dan perbaikan

| Area | Perilaku setelah perbaikan |
| --- | --- |
| Riwayat Sales | Izin eksplisit dipakai untuk menentukan edit, persetujuan, dan penolakan. Mengaktifkan halaman Riwayat atau persetujuan saja belum memberikan hak edit. |
| Syarat edit Riwayat | Perlu akses halaman `/history`, izin baca `transaction.read`, serta izin ubah `transaction.update`. Status dan aturan dokumen tetap diperiksa. |
| Status dokumen | Invoice biasa dapat diedit pada status yang didukung. Void/refund, invoice gabungan, dan nota percetakan yang telah diproses mengikuti pembatasan yang sudah ada. |
| Persetujuan draft Sales | Pembatasan draft yang berasal dari permintaan Sales tetap berlaku; cakupan data Sales tidak diperluas. |
| Katalog izin | Seluruh 25 modul tersedia melalui kelompok yang sama di desktop dan ponsel; pencarian modul dan keadaan hasil kosong tersedia. |
| Sumber daya | Label ramah pengguna dan aksi yang didukung ditampilkan; izin lama yang tidak ditampilkan tetap dipertahankan dalam konfigurasi. |
| Kebijakan Owner | RBAC dan approval inventory khusus Owner ditampilkan sebagai kebijakan terkunci. Owner tetap memiliki akses penuh. |
| Pratinjau | Kebutuhan halaman, data, dan tindakan Riwayat memakai definisi yang sama dengan peringatan editor. Pratinjau tidak menggantikan aturan status atau cakupan data di server. |
| Penyimpanan | Client mengirim perubahan izin beserta versi awal. Perubahan yang berbenturan menghasilkan 409 dan edit lokal tetap tersedia. |
| Konflik | Pengguna dapat memuat versi terbaru melalui tindakan yang jelas bahwa edit lokal akan diganti. Review penyimpanan diblokir sampai konflik diselesaikan. |
| Audit | Actor terautentikasi, waktu, dan perubahan izin dicatat dalam transaksi database yang sama. Halaman menampilkan 20 catatan terbaru. Review dan audit memakai nama tindakan yang sama dan mudah dibaca; kode izin tersedia dalam detail tertutup. |
| Otorisasi server | Pembacaan izin tidak memakai cache proses selama 60 detik. Kegagalan pembacaan menghasilkan akses yang belum terverifikasi, tanpa fallback pemberian izin default. |
| Sesi aktif | Izin diperiksa saat fokus, tab terlihat, kembali online, perubahan RBAC, dan setiap 30 detik saat tab terlihat. Permintaan memiliki batas waktu 10 detik. |
| Perubahan izin sesi | Perubahan akses efektif atau identitas memuat ulang halaman untuk membersihkan data lama dan menjalankan pemeriksaan halaman. Fingerprint hanya memuat izin role pengguna saat ini. |
| Gangguan verifikasi | UI menawarkan coba lagi dan keluar. Form yang sudah terpasang disembunyikan selama gangguan sehingga isian lokal tetap tersimpan sampai verifikasi pulih. |
| Tujuan halaman | Middleware memilih halaman yang benar-benar diizinkan; pengguna tanpa halaman yang diizinkan diarahkan ke halaman tanpa akses. |
| Keyboard | Dialog mengelola Tab, Shift+Tab, Escape, dan pengembalian fokus. Jika tombol review sudah dinonaktifkan atau dilepas, fokus kembali ke pencarian modul. |
| Endpoint lama | `needs-revision` tingkat penerimaan yang sudah ditinggalkan menghasilkan 410 dan petunjuk menuju persetujuan per item. |

## Cara menggunakan

1. Owner membuka **Pengaturan → Hak Akses**, memilih role, lalu mencari atau memilih modul.
2. Periksa akses halaman, data, dan tindakan beserta pratinjaunya. Untuk edit Riwayat, lengkapi tiga izin pada tabel di atas.
3. Buka review, periksa perubahan serta konfirmasi yang diperlukan, lalu simpan. Jika ada konflik, baca catatan terbaru sebelum memuat ulang konfigurasi.

Bantuan, panduan Hak Akses untuk AI Assistant, workflow pengaturan RBAC, dan Catatan Perubahan telah diselaraskan dengan alur ini. Catatan Perubahan memakai ilustrasi yang berlabel karena screenshot fitur lengkap belum terverifikasi.

## Penyimpanan dan migrasi

Migrasi baru: `packages/db/prisma/migrations/20261103020000_rbac_permission_audit/migration.sql`.

Migrasi menambah tabel `pos_role_permission_audits`, indeks waktu, dan RLS tanpa policy browser. Prisma client telah dihasilkan. **Migrasi belum diterapkan ke database pada sesi ini**; tabel audit harus tersedia sebelum menggunakan endpoint pengaturan RBAC yang baru.

Penyimpanan memakai advisory lock transaksi PostgreSQL dan pembacaan `ReadCommitted`, lalu membandingkan versi sebelum menulis. Audit gagal berarti transaksi izin ikut dibatalkan. Penyimpanan tanpa perubahan tidak menambah audit. Respons memakai catatan audit dari transaksi yang baru selesai, sehingga kegagalan query audit tambahan tidak mengubah keberhasilan simpan menjadi pesan gagal.

## Verifikasi

TDD dilakukan untuk perilaku Riwayat, kelengkapan editor, prasyarat akses, konflik dan audit, kegagalan verifikasi, refresh, serta fokus dialog. Regresi diperiksa gagal sebelum implementasinya diperbaiki.

| Pemeriksaan | Hasil |
| --- | --- |
| Tes gabungan RBAC, Riwayat, middleware, API, layout, Bantuan, workflow, dan changelog | 27 suite lulus; satu suite menemukan pemetaan ilustrasi belanja 7 langkah yang tidak sesuai panduan 6 langkah. |
| Ulang suite Bantuan setelah pemetaan diselaraskan, ditambah RoleProvider | 2 suite, 30 tes lulus; seluruh 286 tes unik dalam 29 suite lulus. |
| Koreksi label review dan audit | 3 suite editor, 40 tes lulus, termasuk 2 regresi baru untuk label dan detail teknis. Total akhir **288 tes unik dalam 29 suite**, tanpa kegagalan tersisa. |
| TypeScript aplikasi web | `pnpm --filter @pos/web exec tsc --noEmit --pretty false`: exit 0. Script lint aplikasi memakai pemeriksaan TypeScript yang sama. |
| Fokus dialog pada DOM Chrome native | 3/3: pemicu aktif, disabled, dan detached. |
| `git diff --check` pada lingkup perubahan | Exit 0; hanya peringatan normalisasi LF/CRLF Windows. |
| Review kode independen akhir | **PASS**; tidak ditemukan cacat runtime baru pada alur yang diperiksa: otorisasi terbaru, transaksi simpan/audit, konflik, refresh, halaman tujuan, fokus, dan label. |

Tes memakai runner Vitest native sementara dengan satu worker. Tidak menjalankan seluruh suite repository yang berisi pekerjaan lokal lain; pemeriksaan difokuskan pada alur dan kontrak yang berubah.

Tes penyimpanan memakai adapter transaksi tiruan. Perilaku lock dan latensi pada PostgreSQL aktif, penerapan migrasi, serta konfigurasi RLS produksi belum diuji melalui koneksi database langsung. Review akhir memeriksa source untuk mekanisme tersebut.

## Catatan eksekusi

- Tidak menjalankan build produksi, migrasi database, deploy, commit/push, atau mengubah lifecycle development server.
- Perubahan lokal yang sudah ada dipertahankan; review menggunakan snapshot task agar tidak mencampurkan fitur lain.
- GitNexus MCP tidak tersedia; impact analysis memakai CLI dan source terkini. Risiko tinggi pada helper otorisasi telah dilaporkan sebelum perubahan. Index lama tidak mengenali beberapa helper baru.
- Headroom stats dipanggil; proxy kompresi `127.0.0.1:8787` tidak terjangkau. Pemeriksaan menggunakan output lokal yang dibatasi, tanpa mengirim rahasia repository.
- Vitest memakai konfigurasi native sementara di `.superpowers` untuk menghindari `spawn EPERM` dari loader Windows; konfigurasi produksi dan dependensi tidak diubah.
- Pratinjau komponen RBAC nyata berhasil dibuat dan snapshot struktur halaman dibaca. Pemeriksaan browser lengkap untuk desktop/ponsel belum selesai karena automatic permission review melewati deadline; pengujian DOM native untuk pengembalian fokus berhasil pada tiga keadaan pemicu.
- Drive `D:` tidak tersedia. Dokumentasi disimpan di `C:/Projects/pos-system-monorepo/markdown-files`; lokasi dokumentasi `D:/main_project/pos-system-monorepo/markdown-files` belum dapat diperbarui.

## Integrasi publikasi lanjutan

Perbaikan awal ini dipindahkan sebagai delta terpilih ke checkout publikasi `C:/Users/Raihan Rizki/.codex/worktrees/rbac-access-publish/pos-system-monorepo`, lalu digabung dengan main terbaru. Panduan approval belanja tujuh langkah dan ketujuh target ilustrasinya dari main dipertahankan. Delapan permission fitur baru, kompatibilitas konfigurasi, hasil pemeriksaan lanjutan, dan prasyarat migrasi dijelaskan di `rbac-feature-permissions-2026-11-03.md`.

Pada checkout publikasi, pemeriksaan TypeScript web, database, UI, serta worker impor lulus. Perintah type-check agregat sempat memicu build melalui Turbo dan dihentikan; pemeriksaan dilanjutkan dengan TypeScript langsung. Database dan server development tetap dikelola terpisah dari publikasi kode ini.
