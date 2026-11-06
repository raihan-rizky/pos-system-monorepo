# Perbaikan akses POS offline — 2026-11-07

## Ringkasan

POS yang dibuka kembali dengan PIN offline tidak lagi ditutup ketika pemeriksaan izin jaringan gagal karena koneksi terputus. Handoff sementara hanya berlaku untuk kasir dan toko yang sama, selama persiapan POS belum kedaluwarsa, dan hanya membuka rute POS.

## Perilaku izin

- Saat PIN berhasil, halaman meneruskan identitas kasir, toko, waktu persiapan, dan nonce sesi ke dokumen POS.
- Saat offline, akses dibatasi pada POS dan tindakan transaksi atau shift yang diizinkan snapshot izin.
- Saat koneksi kembali, handoff dihapus dan konten diblokir sebelum pemeriksaan izin terbaru selesai.
- Respons izin yang tidak cocok atau tidak valid tetap ditolak; sinkronisasi server tetap melakukan pemeriksaan RBAC.

## Verifikasi

- Unit helper hak akses offline: 6 tes lulus.
- E2E POS offline: membuka shift dan mengantre transaksi lulus.
- E2E Offline Sync: status Online/Offline lulus.
