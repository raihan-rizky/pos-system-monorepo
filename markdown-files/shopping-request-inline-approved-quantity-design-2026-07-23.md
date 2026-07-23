# Inline Jumlah yang Di-ACC pada Modal Setujui Daftar Belanja

Tanggal: 2026-07-23

## Tujuan

Memungkinkan pengguna mengisi **Jumlah yang Di-ACC** langsung dari modal **Setujui Daftar Belanja**, sambil tetap menampilkan **Kebutuhan Belanja** secara jelas. Flow ini mengurangi perpindahan modal tanpa menghilangkan tombol dan modal khusus **Isi Jumlah yang Di-ACC** yang sudah ada.

## Keputusan Produk

- Item yang belum memiliki jumlah ACC selalu dimulai dengan input kosong.
- Nilai `0` berarti item tidak disetujui dan tidak menambah stok.
- Nilai di atas kebutuhan tetap diperbolehkan setelah satu konfirmasi eksplisit.
- Item yang sudah diputuskan bersifat read-only dan tetap menampilkan kebutuhan, jumlah ACC, status, serta pengambil keputusan.
- Modal khusus **Isi Jumlah yang Di-ACC** tetap tersedia sebagai workflow persiapan terpisah.

## RBAC

- Hak mengubah input mengikuti permission existing `supplier.shopping_request.set_approved_qty:update`.
- Pengguna dengan permission tersebut dapat mengisi atau mengubah jumlah ACC pada item pending.
- Pengguna tanpa permission tersebut hanya dapat melihat jumlah yang sudah tersimpan.
- Permission approval tetap `supplier.shopping_request.approve_stock:update`.
- Pengguna yang hanya memiliki permission approval dapat menyetujui item jika jumlah ACC sudah disiapkan oleh pengguna berwenang. Item tanpa jumlah ACC tetap disabled.

## Desain UI

Setiap kartu item menampilkan:

1. Identitas produk: thumbnail, nama, dan SKU.
2. **Kebutuhan Belanja** sebagai nilai read-only lengkap dengan unit.
3. **Jumlah yang Di-ACC** sebagai input angka untuk pengguna berwenang atau nilai read-only untuk pengguna lain.
4. Pilihan mode stok final untuk item pending.
5. Status keputusan dan tombol **Setujui Item**.

Bagian header modal tetap menampilkan supplier dan progress item. Informasi nomor daftar belanja dan catatan ditambahkan agar approver memahami konteks permintaan tanpa keluar dari modal.

Input menerima angka nol atau lebih dengan step desimal `0.01`. Input kosong, angka negatif, dan nilai non-finite dianggap invalid. Live preview stok serta estimasi pengeluaran mengikuti nilai input lokal setelah debounce.

## Data Flow

### Approval satu item

1. Validasi nilai lokal item.
2. Jika melebihi kebutuhan, tampilkan satu dialog konfirmasi.
3. Jika pengguna boleh mengubah jumlah, panggil endpoint penyimpanan jumlah ACC untuk item tersebut.
4. Setelah penyimpanan berhasil, panggil endpoint approval item dengan mode stok final.
5. Mutation response memperbarui cache detail dan daftar belanja.

### Approval semua item tersisa

1. Pastikan semua item pending memiliki jumlah ACC valid.
2. Jika ada nilai melebihi kebutuhan, tampilkan satu dialog konfirmasi yang mencakup seluruh item terkait.
3. Jika pengguna boleh mengubah jumlah, simpan seluruh jumlah item pending dalam satu request.
4. Setelah penyimpanan berhasil, panggil endpoint approval massal.
5. Mutation response memperbarui cache detail dan daftar belanja.

Pendekatan dua request dipilih karena mempertahankan endpoint, transaction, dan batas permission existing. Jika penyimpanan berhasil tetapi approval gagal, jumlah tetap tersimpan sebagai draft persiapan approval dan pesan error approval ditampilkan. Pengguna dapat mencoba approval lagi tanpa kehilangan input.

## Error Handling

- Input invalid menonaktifkan tombol approval terkait dan menampilkan petunjuk singkat.
- Error penyimpanan atau approval ditampilkan pada area error modal.
- Loading state mencakup proses simpan dan approval agar tombol tidak dapat diklik berulang.
- Preview error tidak menghapus input pengguna, tetapi menonaktifkan approval sampai preview valid.
- Pengguna tanpa permission quantity melihat petunjuk bahwa jumlah harus disiapkan melalui tombol **Isi Jumlah yang Di-ACC** jika nilainya masih kosong.

## Perubahan Komponen

- `ShoppingRequestApproveModal.tsx`
  - Menambahkan state string untuk input quantity.
  - Menggunakan `useSaveShoppingRequestApprovedQuantities`.
  - Membaca permission quantity melalui role provider.
  - Menampilkan kebutuhan, input/read-only quantity, nomor request, dan catatan.
  - Menjalankan save-before-approve.
- Help page dan dokumentasi AI Supplier/FAQ diperbarui agar workflow inline dan permission tetap sinkron.
- Workflow catalog AI diperbarui agar guided workflow menjelaskan input inline dan batas permission yang sama.

## Strategi Pengujian

TDD mencakup:

- Pending item menampilkan Kebutuhan Belanja dan input Jumlah yang Di-ACC.
- Nilai awal kosong ketika `approvedQty` belum tersimpan.
- Input hanya editable dengan permission quantity.
- Approval satu item menyimpan quantity sebelum memanggil approval.
- Approval semua menyimpan seluruh quantity pending sebelum approval.
- Nilai kosong/negatif menonaktifkan approval.
- Nilai nol tetap valid.
- Nilai di atas kebutuhan memakai satu konfirmasi dan meneruskan flag konfirmasi ke save serta approval.
- Item decided tetap locked.
- Regression suite Daftar Belanja, help docs, workflow catalog, dan TypeScript tetap lulus.

## Di Luar Scope

- Menghapus modal khusus **Isi Jumlah yang Di-ACC**.
- Menggabungkan endpoint save quantity dan approval menjadi satu endpoint baru.
- Mengubah schema database atau status lifecycle Daftar Belanja.
- Mengubah definisi permission RBAC existing.

## Status Implementasi

Diimplementasikan pada 2026-07-23:

- Parser murni membedakan input kosong dari nilai `0` yang valid.
- Orkestrasi teruji menyimpan Jumlah yang Di-ACC sebelum approval individual atau massal.
- Modal approval menampilkan input Jumlah yang Di-ACC, Kebutuhan Belanja, nomor permohonan, supplier, dan catatan.
- Permission `supplier.shopping_request.set_approved_qty:update` menentukan input editable; approver lain mendapat tampilan read-only.
- Bantuan, FAQ, dokumentasi Supplier, dan workflow catalog AI telah disinkronkan.

Evidence verifikasi final:

- Focused feature suite: 5 files, 41 tests lulus.
- Full shopping-request regression: 12 files, 69 tests lulus.
- ESLint untuk seluruh file TypeScript/TSX yang berubah: lulus.
- TypeScript `tsc --noEmit`: lulus.
- Dev server existing merespons `/login` dengan HTTP 200 dan HMR berhasil compile.
