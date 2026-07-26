# Catatan Transaksi di Halaman Riwayat

**Date:** 2026-07-27
**Status:** Approved (design)

## Masalah

Kolom `Transaction.note` sudah ada di skema dan sudah ikut terkirim dari `GET /api/transactions` (route memakai `include`, jadi semua field skalar terbawa), tapi tidak pernah dirender di halaman Riwayat. Kasir tidak bisa melihat catatan sebuah transaksi tanpa membuka detailnya, dan tidak bisa mengubahnya sama sekali setelah transaksi jadi.

Yang dimaksud "catatan" di sini adalah **`Transaction.note`** — catatan per transaksi yang diisi saat checkout. Bukan `Customer.notes` (catatan tetap di master pelanggan), yang tidak disentuh sama sekali oleh perubahan ini.

## Ruang lingkup

1. Tampilkan `tx.note` di bawah nama pelanggan di tabel desktop.
2. Tampilkan `tx.note` sebagai baris tersendiri di kartu mobile, dengan modal untuk teks penuh.
3. Izinkan mengubah catatan lewat modal Ubah Transaksi.

## Perubahan

### 1. Tabel desktop — sel kolom Pelanggan

Berkas: `apps/web/app/(main)/history/page.tsx`, sel di sekitar baris 1421.

Sel jadi dua baris:

- Baris atas: nama pelanggan, persis seperti sekarang (`whitespace-nowrap`, fallback italic "Umum").
- Baris bawah: `tx.note` — 11px, `text-surface-500`, `line-clamp-2`, `whitespace-normal`, dengan atribut `title={tx.note}` supaya teks penuh muncul sebagai tooltip bawaan browser saat hover.

Sel dibatasi `max-w-[220px]` supaya `line-clamp-2` punya patokan lebar dan tabel tidak melar.

Bila `tx.note` null atau string kosong, elemen catatan tidak dirender sama sekali — tinggi baris tabel tetap seperti sekarang.

JSX ditulis langsung di sel, tidak lewat komponen bersama: tampilan desktop dan mobile berbeda perilaku, jadi tidak ada logika yang layak dibagi.

### 2. Kartu mobile — baris Catatan

Berkas yang sama, blok kartu mobile di sekitar baris 1635–1667.

Baris baru disisipkan **tepat di bawah baris Sales** (sekitar baris 1647), sebelum baris badge pembayaran + total. Mengikuti layout saudara-saudaranya:

- Bungkus `flex justify-between text-sm`.
- Kiri: label statis `Catatan`, `text-surface-500`.
- Kanan: nilai catatan dalam `<button>`, `truncate`, `max-w-[60%]`, `font-medium`, dengan garis bawah putus-putus tipis (`underline decoration-dotted decoration-surface-300 underline-offset-2`) sebagai penanda bisa diklik.

Selalu satu baris, jadi tinggi kartu tidak berubah.

Perilaku klik: membuka modal catatan penuh. Handler memanggil `stopPropagation()` karena kartu itu sendiri sudah bisa diklik untuk membuka detail transaksi.

Tombolnya **selalu** bisa diklik selama catatan ada — termasuk saat catatannya pendek dan muat satu baris penuh. Ini disengaja: perilaku yang berubah-ubah tergantung panjang teks lebih membingungkan daripada modal yang kadang isinya pendek.

Bila `tx.note` null atau kosong, seluruh baris tidak dirender.

### 3. Modal catatan (komponen baru)

Berkas baru: `apps/web/app/(main)/history/components/TransactionNoteModal.tsx`.

Baca saja. Mengikuti pola modal yang sudah dipakai di halaman ini (lihat `EditModal` di `page.tsx` sekitar baris 260–283) karena proyek ini tidak punya komponen Modal bersama — setiap modal menulis backdrop dan panelnya sendiri:

- Backdrop `fixed inset-0 z-50` dengan `bg-black/40 backdrop-blur-sm`; klik backdrop menutup.
- Panel `rounded-2xl` putih, lebar maksimum `max-w-sm`, tinggi maksimum `max-h-[90vh]`.
- Header: judul "Catatan", nomor invoice sebagai subjudul, tombol X di kanan. Untuk transaksi sementara yang `invoiceNumber`-nya masih null, subjudul memakai `draftNumber`; bila keduanya null, subjudul tidak dirender.
- Body: teks catatan penuh dengan `whitespace-pre-wrap` (baris baru yang diketik kasir tetap terlihat) dan `overflow-y-auto` bila panjang.

Props: catatan dan nomor invoice yang ditampilkan, plus `onClose`.

Halaman menyimpan state `noteModalTx` (transaksi yang catatannya sedang dibuka, atau `null`).

Catatan tidak bisa diedit dari modal ini. Mengubah catatan tetap lewat modal Ubah Transaksi.

### 4. Gaya transaksi void

Di kedua tampilan, catatan mengikuti gaya kolom sebelahnya untuk transaksi berstatus `VOIDED`: `text-surface-400` dan `line-through`.

### 5. Modal Ubah Transaksi — field Catatan

Berkas yang sama, `EditModal`.

- `EditForm` dapat field `note: string`, diisi awal dari `tx.note ?? ""`.
- `<textarea>` berlabel "Catatan", 3 baris, placeholder "Catatan transaksi (opsional)", ditaruh tepat di bawah field Nama Pelanggan (sekitar baris 324). Gaya mengikuti input di sekitarnya.
- `note` selalu ikut di payload `updateTx.mutateAsync` (tidak seperti `status` yang hanya dikirim bila berubah), sehingga menghapus isi catatan sampai kosong tetap tersimpan.

### 6. Alur data — hook

Berkas: `apps/web/hooks/useTransactions.ts`, `UpdateTransactionInput` sekitar baris 297.

Tambah `note?: string | null`. Tidak ada perubahan lain — `updateTransaction` sudah meneruskan seluruh body apa adanya.

### 7. Alur data — API

Berkas: `apps/web/app/api/transactions/[id]/route.ts`.

- `updateTransactionSchema` (baris 27) dapat `note: z.string().optional().nullable()`.
- `note` ikut didestrukturisasi dari `parsed.data` (baris 154).
- Di blok `updateData` (sekitar baris 209), tambah `if (note !== undefined) updateData.note = note || null;` — pola yang sama persis dengan `customerName`, termasuk mengubah string kosong menjadi `null`.

Tidak ada gerbang izin baru. Siapa pun yang sudah boleh membuka modal Ubah (`transaction:update`) boleh mengubah catatan. Validasi transisi status dan pembalikan stok untuk void tidak tersentuh.

## Yang sengaja tidak dikerjakan

- Pencarian di halaman Riwayat tetap tidak menjangkau isi catatan.
- Tidak ada log riwayat perubahan catatan.
- Catatan di tabel desktop tetap memakai tooltip, tidak membuka modal.
- `Customer.notes` tidak disentuh.

## Pengujian

- `apps/web/app/api/transactions/[id]/__tests__/route.test.ts`: PATCH dengan `note` menyimpan nilainya; PATCH dengan `note: ""` menyimpan `null`.
- Test baru untuk `TransactionNoteModal`: merender teks catatan penuh, dan tombol tutup memanggil `onClose`.
