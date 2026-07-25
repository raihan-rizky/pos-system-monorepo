# Legacy Shopping Request → Goods Purchase

**Date:** 2026-07-25
**Status:** Approved (design)

## Problem

Di modal "Buat Pembelian Barang", dropdown "Pilih Daftar Belanja" bisa tampil kosong meskipun ada Daftar Belanja berstatus APPROVED di riwayat. Penyebabnya: query kelayakan (`listEligibleShoppingRequests`) menyaring dengan syarat `expense: null`.

Dulu, alur lama membuat record `Expense` langsung saat sebuah Shopping Request disetujui. Perilaku itu sudah dihapus (commit `488292c`, `87108cb`) — sekarang expense hanya dibuat saat Pembelian Barang difinalisasi. Akibatnya, Shopping Request yang disetujui **sebelum** perbaikan itu terlanjur punya `expense` warisan dan selamanya tersaring keluar dari dropdown.

Diagnostik pada store `store-main`:

| Nomor | status | supplier aktif | expense | item ter-ACC | muncul di dropdown |
|---|---|---|---|---|---|
| DPB-202607-001 | APPROVED | ya | **SET (legacy)** | 1 | ❌ tidak |
| DPB-202607-002 | APPROVED | ya | null | 2 | ✅ ya |

## Discriminator: legacy vs baru

Expense dari alur lama: `shoppingRequestId` terisi, `goodsPurchaseId` **null**.
Expense dari Pembelian Barang: `goodsPurchaseId` **terisi**.

Jadi sebuah Shopping Request bersifat **legacy** bila punya expense dengan `goodsPurchaseId: null`. Ini pembeda yang aman dan tidak ambigu.

## Keputusan finansial

Saat Pembelian Barang untuk request legacy difinalisasi: **hapus expense lama, buat expense baru.** Alasan: kolom `Expense.shoppingRequestId` bersifat `@unique`, sehingga membuat expense baru tanpa menghapus yang lama akan bentrok constraint; sekaligus mencegah dobel-catat pengeluaran untuk barang yang sama. Semua dilakukan dalam satu transaksi.

## Perubahan

### 1. Repository — `listEligibleShoppingRequests`

Ganti filter `expense: null` menjadi: tidak punya expense **atau** expense-nya legacy.

```
OR: [
  { expense: null },
  { expense: { is: { goodsPurchaseId: null } } },
]
```

Tambahkan `expense: { select: { id: true, amount: true, goodsPurchaseId: true } }` pada select, lalu turunkan per-request:
- `isLegacy: boolean` — true bila ada expense dengan `goodsPurchaseId === null`
- `legacyExpenseAmount: number | null`
- `stockApplied: boolean` — dari `stockAppliedAt !== null` (untuk pesan konfirmasi bahwa stok sudah berubah)

### 2. Repository — `createGoodsPurchaseRecord` eligibility WHERE

Relaksasi yang sama pada WHERE `tx.shoppingRequest.findFirst` (ganti `expense: null` dengan `OR` di atas), supaya submit legacy tidak ditolak `REQUEST_NOT_ELIGIBLE`.

### 3. Repository — `finalizeGoodsPurchaseIfReady`

Tepat sebelum `tx.expense.create`, hapus expense legacy bila ada:

```
await tx.expense.deleteMany({
  where: { shoppingRequestId: purchase.shoppingRequestId, goodsPurchaseId: null },
});
```

Lalu lanjutkan `tx.expense.create` seperti sekarang.

### 4. Types — `EligibleShoppingRequest`

Tambah `isLegacy: boolean`, `legacyExpenseAmount: number | null`, `stockApplied: boolean`.

### 5. UI — `GoodsPurchaseCreateModal`

- **Dropdown:** opsi legacy diberi penanda teks, mis. `⚠ LAMA` pada label `<option>`.
- **Baner info:** saat request terpilih adalah legacy, tampilkan baner amber (bukan cyan) yang menjelaskan: data dari alur lama, stok sudah pernah diubah, dan expense lama (nominal) akan diganti dengan yang baru saat pembelian disetujui. Request baru tetap baner cyan seperti sekarang.
- **Checkbox konfirmasi:** untuk request legacy, tampilkan checkbox "Saya paham ini Daftar Belanja lama, stok sudah berubah, dan expense lama akan diganti." Tombol "Ajukan Pembelian Barang" hanya aktif bila checkbox dicentang. Request baru tidak menampilkan checkbox dan tidak terpengaruh.

## Testing

- Repository test: `listEligibleShoppingRequests` memasukkan request legacy dan menandai `isLegacy`; request dengan expense ber-`goodsPurchaseId` (dari pembelian) tetap dikecualikan.
- Repository test: finalisasi menghapus expense legacy sebelum membuat expense baru.
- UI test: modal menampilkan checkbox + baner amber untuk legacy, dan tombol submit terkunci sampai checkbox dicentang.

## Out of scope

- Tidak ada migrasi data untuk melepas expense legacy secara massal; penanganan dilakukan on-demand saat pembelian difinalisasi.
