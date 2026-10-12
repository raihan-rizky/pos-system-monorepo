# Badge dan filter penerimaan di Daftar Belanja

Tanggal: 12 Oktober 2026

## Perilaku

Kartu Daftar Belanja menampilkan status penerimaan di samping badge persetujuan ketika Pembelian Barang terkait sudah berstatus `APPROVED`:

| Status penerimaan | Badge | Pilihan filter |
| --- | --- | --- |
| `NOT_RECEIVED` | BARANG BELUM DITERIMA | Belum diterima |
| `PARTIALLY_RECEIVED` | BARANG DITERIMA SEBAGIAN | Diterima sebagian |
| `RECEIVED` | BARANG SUDAH DITERIMA (ungu) | Sudah diterima |

Daftar tanpa pembelian, pembelian menunggu persetujuan, dan pembelian ditolak tidak mendapatkan badge penerimaan atau masuk ke filter penerimaan. Pilihan **Semua penerimaan** mempertahankan daftar tanpa batasan penerimaan.

Filter penerimaan dapat digabungkan dengan pencarian, status persetujuan, dan filter supplier API. Mengganti filter mengembalikan halaman ke halaman pertama.

## Implementasi

- `ShoppingRequestList.tsx` memakai status penerimaan Pembelian Barang yang sudah tersedia pada data kartu.
- Parameter API opsional `fulfillmentStatus` menerima tiga status di atas; nilai lain diabaikan.
- `buildShoppingRequestWhere` membatasi relasi Pembelian Barang ke status `APPROVED` dan status penerimaan yang dipilih. Kondisi yang sama dipakai untuk daftar dan penghitungan total sebelum pagination.
- Query key React Query sudah mencakup parameter filter. Status penerimaan tetap mengikuti mekanisme pencatatan dan persetujuan penerimaan yang ada.
- Halaman Bantuan menjelaskan badge dan filter baru.

## Verifikasi

Sebanyak 21 uji terarah lulus: tujuh uji tampilan badge/filter dan 14 uji repository, API, rute, serta kompatibilitas Daftar Belanja. Uji baru sempat diverifikasi gagal sebelum implementasi. `git diff --check` tidak menemukan masalah whitespace.

`pnpm type-check` monorepo berhenti pada `@pos/db:build`: Prisma gagal mengganti `query_engine-windows.dll.node` dengan error Windows `EPERM`. Pemeriksaan type-check web langsung dan uji regresi yang lebih luas tidak selesai saat proses lain dan uji inventaris berjalan dalam workspace.

## Catatan lingkungan

Dokumentasi disimpan di `C:\Projects\pos-system-monorepo\markdown-files` dengan persetujuan pengguna karena drive D: tidak tersedia. Server pengembangan tidak dimulai atau dihentikan, dan build produksi tidak dijalankan.

Headroom MCP dipanggil pada awal sesi dan digunakan untuk kompresi; proxy lokalnya tidak terhubung dan tool tidak tersedia lagi pada pemeriksaan akhir. Serena dicoba pada awal sesi tetapi tool tidak tersedia. GitNexus CLI digunakan untuk analisis dampak karena MCP GitNexus tidak tersedia; indeks melaporkan risiko LOW pada simbol yang diubah, dengan pencarian kata kunci terbatas karena ekstensi FTS tidak tersedia.
