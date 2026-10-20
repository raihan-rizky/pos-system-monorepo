# Rencana Implementasi POS Percetakan

Tanggal: 2026-10-20 (Asia/Jakarta)

Spec: [Rancangan disetujui](percetakan-pos-design-2026-10-20.md)

## Batas global

- Tidak commit/push, tidak production build, tidak mengelola server pengembangan, tidak mengubah database produksi.
- Pertahankan perubahan pengguna yang sudah ada. Gunakan branch `codex/percetakan-nota` pada checkout aktif agar perubahan label dan server pengguna tetap tersedia.
- TypeScript, teks Indonesia, otorisasi dan batas toko mengikuti transaksi yang ada.
- TDD: tulis perilaku yang belum tersedia, jalankan hingga gagal, implementasikan, jalankan kembali. Tidak ada assertion yang hanya mencocokkan teks kode.
- Jalankan impact GitNexus sebelum mengubah simbol lama; catat keterbatasan FTS. Headroom dipanggil dengan keluaran dibatasi karena proxy tidak tersedia.
- Dokumentasi disimpan di markdown-files checkout aktif karena lokasi D: tidak tersedia.

## Antarmuka bersama

Fitur baru ditempatkan di `apps/web/features/printing-receipts`.

- `types.ts`: `PRINTING_SUBCATEGORIES`, `PrintingSubcategory`, `PrintingReceiptLine`, `PrintingReceiptDocument`, `PrintingReceipt`.
- Baris: `{ id, name, material, quantity: number|null, price: number|null, stockLink: {productId, quantity, unit}|null }`.
- Dokumen: `{ customerName, customerPhone, customerId: string|null, date, note, completionDate, completionTime, receiver, setter, signatory, lines }`, seluruh isian teks string.
- Nota: `{ id, storeId, subcategory, number, revision, document, transactionId, transaction?, createdAt, updatedAt }`.
- Model Prisma `PrintingReceipt`: id, storeId, subcategory, number unik, revision, document JSON, createdById, transactionId unik nullable, timestamps. Relasi transaction bernama `printingReceipt`. Counter atomik dialokasikan di server.
- Transaksi menambah `transactionCategory` ATK/PERCETAKAN nullable untuk kompatibilitas, `printingSubcategory` nullable. Transaksi lama diklasifikasi berdasarkan item layanan tanpa menebak subkategori.
- `GET/POST /api/printing-receipts`: daftar berpaginasi per subtab/pencarian dan buat kosong.
- `GET/PATCH/DELETE /api/printing-receipts/[id]`: baca, simpan `{revision,number,document}`, hapus draft dengan revision. Konflik 409, isolasi toko 404, validasi 422.
- Checkout tetap `POST /api/transactions`, menambah `printingReceiptId` dan `printingReceiptRevision`. Server mengambil isi dari nota tersimpan, mengunci revision, membuat transaksi dan menautkannya dalam satu transaksi database. Pengulangan mengembalikan transaksi yang sama.
- Item manual memakai `PRINTING_SERVICE` dengan `printingServiceId:null` hanya dalam konteks nota terverifikasi; tidak membuat entri katalog palsu. Klien memakai `PaymentModal` yang ada.
- Riwayat menambah query `transactionCategory`, `printingSubcategory`; `categoryId` tetap untuk subkategori ATK. Filter dan count memakai where yang sama.

## Tugas 1 — Domain, skema dan penyimpanan

- [x] Tes domain untuk draft kosong, nilai uang/kuantitas, baris kosong, hubungan stok, batas field dan checkout valid.
- [x] Tes API batas toko/izin, nomor custom duplikat, revision konflik, daftar per subtab, draft tidak membentuk transaksi/stok.
- [x] Implementasikan types/domain dan service penyimpanan yang digunakan route; model dan migration aditif, tanpa menerapkan migration produksi.
- [x] Generate Prisma client lokal. Uji terarah dengan `pnpm --filter @pos/web test features/printing-receipts/__tests__/domain.test.ts app/api/printing-receipts`.

## Tugas 2 — Editor dan cetak

- [x] Render aset asli dua PDF ke `apps/web/public/images/printing-receipts`, ukur koordinat header/tabel/footer.
- [x] Tes pembagian halaman 6/13 baris, nomor aktual menutupi nomor contoh, total di halaman terakhir, dan jumlah/DP/sisa.
- [x] Implementasikan layout bersama editor dan jsPDF; hindari perubahan proporsi asli.
- [x] Implementasikan workspace subtab/daftar/pagination, draft kosong persisten, autosave serial dengan revision dan pesan konflik, viewport mobile serta keyboard.
- [x] Integrasi PaymentModal dan checkout terpisah dari keranjang ATK. Sinkronkan simpan sebelum berpindah/checkout.
- [x] Ganti penggunaan PrintingServicesTab di POS dengan workspace baru.

## Tugas 3 — Checkout dan integritas transaksi

- [x] Tes API manual item, jumlah server, pembayaran/DP, duplikasi permintaan, revision, toko, tautan stok dan rollback.
- [x] Tambahkan konteks nota pada POST, kunci dan tautkan atomik, pertahankan seluruh aturan pembayaran/izin/approval yang ada.
- [x] Simpan kategori/subkategori/nomor. Item bebas tanpa stok tidak mengurangi stok; bahan terkait memakai stock journal yang ada.
- [x] Cetak ulang dari ReceiptModal menggunakan nota tersimpan dan nilai pembayaran terbaru. Cegah editor transaksi umum membuat snapshot nota tidak konsisten.
- [x] Jalankan regresi transaksi ATK, layanan lama, approval, pembayaran dan pengubahan dokumen.

## Tugas 4 — Riwayat dan panduan

- [x] Tes query dependent category, klasifikasi legacy, item ATK banyak kategori dan jumlah pagination.
- [x] Implementasikan dua filter kategori/subkategori; pergantian kategori mereset subkategori dan halaman.
- [x] Tampilkan identitas kategori/subkategori di detail/daftar yang relevan.
- [x] Perbarui HelpContent, preview/guides, workflow-catalog dan changelog dengan tanggal WIB, highlight singkat, tepat tiga langkah.

## Tugas 5 — Tinjauan dan penyerahan

- [x] Tinjau setiap tugas terhadap spec dan mutu kode; benahi temuan sebelum tahap berikutnya.
- [x] Jalankan tes fitur dan regresi terkait, TypeScript, lint terbatas dan diff check. Tanpa pnpm build.
- [x] Tinjau PDF keluaran kedua ukuran dan halaman lanjutan secara visual. UI diperiksa melalui harness browser dengan layanan simulasi karena browser server pengguna tidak tersedia.
- [x] Perbarui dokumentasi aktual, migrasi development yang telah diterapkan, hasil dan batas verifikasi. Headroom stats akhir.
- [x] Serahkan perubahan lokal tanpa commit/push.

Hasil akhir: 68 berkas / 747 tes gabungan lulus; 21 tes izin/render lulus ulang setelah perapian lint; harness browser PASS 1280 / PASS 390; TypeScript dan ESLint 68 berkas terkait selesai dengan exit code 0; diff check bersih. Migrasi development telah diterapkan dan status schema up to date. Batas verifikasi browser dijelaskan pada dokumentasi fitur.

## Tinjauan antarmuka

| Produsen | Pemakai | Kontrak |
| --- | --- | --- |
| Domain/persistence | Editor, checkout | types.ts, document validation, record JSON dan revision |
| Skema | Checkout, Riwayat | transactionCategory, printingSubcategory, printingReceipt relation |
| Editor | Checkout | printingReceiptId/revision dan PaymentModal yang ada |
| Layout | Editor, cetak ulang | ukuran/koordinat tunggal untuk dua artwork asli |
| Filter Riwayat | API GET/count | kategori utama dan subkategori berbeda, tidak ditebak dari nama |

Ruling: lanjut pada branch baru di checkout aktif — menjaga pekerjaan yang sudah ada serta akses server pengguna; tidak ada reset atau pemindahan file.
