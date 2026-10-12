# Aturan harga untuk semua satuan dalam kategori

Tanggal: 2026-10-12
Status: Rancangan dan spesifikasi disetujui; implementasi selesai dan pengujian fitur lulus. Pemeriksaan TypeScript penuh terhalang error di luar lingkup perubahan.

## Tujuan

Pengguna dapat memilih **Semua satuan** pada formulir Tambah aturan harga dan Ubah aturan harga, termasuk untuk Modal + rupiah dan Modal + persen. Satu aturan mencakup seluruh satuan pada kategori yang dipilih, termasuk satuan yang ditambahkan setelah aturan disimpan.

## Perilaku

- Dropdown Satuan menyediakan Semua satuan serta pilihan satuan tertentu. Pilihan awal dan satuan kosong pada aturan lama berarti Semua satuan, mengikuti representasi yang sudah digunakan untuk diskon.
- Semua satuan disimpan sebagai `unit: null`; pilihan satuan tertentu tetap disimpan sebagai nama satuan. Tidak diperlukan migrasi database atau pembuatan aturan terpisah per satuan.
- Kategori tetap wajib dipilih. Dropdown dapat digunakan setelah kategori dipilih, termasuk ketika daftar satuan kosong. Status pemuatan, kegagalan, dan tombol coba lagi tetap tersedia.
- Mengganti kategori mengembalikan pilihan satuan ke Semua satuan agar satuan dari kategori sebelumnya tidak terbawa.
- Bantuan isian menjelaskan apakah aturan berlaku untuk semua satuan atau hanya satuan yang dipilih. Satuan tidak lagi diberi tanda wajib.
- Pratinjau dapat dimuat untuk Semua satuan dan menampilkan contoh produk dari satuan berbeda sesuai data yang tersedia. Filter kategori dan merek tetap berlaku.
- Rumus modal tetap memakai modal unit terkecil setiap produk tanpa dikalikan isi kemasan. Contoh: modal Rp700/pcs + Rp4.000 menghasilkan Rp4.700 pada masing-masing satuan yang cocok. Fitur ini tidak mengubah konversi atau rumus harga.
- Produk tanpa modal yang valid tetap menggunakan perilaku harga pengganti yang sudah ada, dan pratinjau menjelaskan modal yang belum tersedia.
- Prioritas pemilihan aturan tidak berubah: aturan khusus satuan lebih spesifik daripada Semua satuan bila cakupan pelanggan dan mereknya sama. Pemeriksaan aturan aktif yang bertumpang tindih tetap berlaku untuk cakupan yang sama.
- Membuka kembali aturan harus mempertahankan Semua satuan atau satuan tertentu sesuai nilai tersimpan.

## Bagian implementasi

- `PricingRuleForm.tsx`: dropdown, bantuan isian, aktivasi permintaan pratinjau, dan keadaan pratinjau untuk Semua satuan.
- `pricing-form.ts`: izinkan satuan kosong pada validasi rumus modal.
- `rule-persistence.ts` dan validasi API terkait: izinkan cakupan semua satuan saat membuat maupun mengubah aturan rumus modal.
- Pertahankan representasi nullable dan pencocokan aturan dalam mesin harga yang sudah ada.
- Perbarui Bantuan di `HelpContent.tsx` untuk menjelaskan cakupan Semua satuan dan rumus modal. Perbarui katalog workflow hanya bila prosedur terpandu yang terkait perlu diubah.

## Validasi

Gunakan test-driven development: tulis dan jalankan pengujian yang gagal karena perilaku belum tersedia, lalu implementasikan perubahan minimal hingga lulus.

Pengujian mencakup pilihan Semua satuan pada kedua rumus modal, penyimpanan dan pengubahan `unit: null`, pratinjau tanpa filter satuan, pencocokan beberapa satuan termasuk satuan baru, prioritas aturan khusus satuan, pergantian kategori, dan perilaku saat modal tidak tersedia. Jalankan pengujian terkait, lint, dan pemeriksaan TypeScript yang sesuai. Jangan menjalankan production build atau mengubah siklus hidup server development.

## Catatan lingkungan

Direktori yang diminta `D:\main_project\pos-system-monorepo\markdown-files` tidak tersedia; komputer ini hanya memiliki drive C. Spesifikasi disimpan dalam `C:\Projects\pos-system-monorepo\markdown-files`.

Headroom MCP dapat dipanggil, tetapi melaporkan proxy lokal tidak dapat dihubungi. Penelusuran menggunakan keluaran terbatas. GitNexus tersedia melalui CLI; pencarian awal melaporkan indeks FTS tidak tersedia. Analisis dampak simbol wajib dilakukan sebelum mengubah implementasi.

## Batas lingkup

Tidak menambahkan pilihan jamak untuk subset satuan, tidak membuat aturan massal, dan tidak mengubah perhitungan konversi satuan atau prioritas pelanggan dan merek.

## Hasil implementasi dan verifikasi

- Formulir menyediakan Semua satuan untuk keempat metode harga. Dropdown tetap dapat dipakai setelah kategori dipilih saat daftar satuan memuat atau kosong; status pemuatan dan coba lagi tetap tersedia.
- Validasi formulir dan schema bersama untuk POST/PATCH menerima cakupan semua satuan pada kedua rumus modal. Representasi tersimpan tetap `unit: null`.
- Pratinjau formula aktif tanpa filter satuan. Perhitungan modal dan prioritas aturan khusus satuan tetap seperti sebelumnya.
- Bantuan, workflow customer-special-pricing, serta sumber pengetahuan FAQ dan produk AI Assistant sudah diselaraskan.
- TDD: 13 pengujian gagal sesuai harapan sebelum implementasi. Sesudah implementasi, 122 pengujian fitur harga kategori dan API lulus, ditambah 37 pengujian Bantuan dan katalog workflow. Total 159 pengujian lulus.
- `git diff --check` lulus. Analisis GitNexus atas cakupan perubahan berisiko rendah; indeks FTS tetap memiliki keterbatasan yang dicatat di atas.
- ESLint langsung pada seluruh file TypeScript/TSX yang diubah lulus tanpa error.
- `pnpm lint` dan `pnpm type-check` dari root terhalang langkah generate Prisma karena Windows mengunci DLL query engine. Server development tidak dihentikan.
- Pemeriksaan langsung dengan `pnpm -r --if-present run lint` dan `pnpm -r --if-present run type-check` berjalan tanpa generate Prisma. Paket database/UI dan lint admin lulus; pemeriksaan web melaporkan tiga error dari `.next-e2e/types/validator.ts` untuk route stock-history, internal-stock-out approve, dan internal-stock-out reject. File route tersebut tidak diubah dalam fitur ini; tidak ada error TypeScript yang dilaporkan pada file perubahan.
- Tidak menjalankan production build aplikasi, tidak mengubah dependency, database, atau lifecycle server development.
- Perubahan berada pada branch `codex/all-unit-category-pricing`. Percobaan commit spesifikasi sebelumnya terhalang lock Git; perubahan fitur belum di-commit.
