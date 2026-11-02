# Harga custom khusus satu nota

Tanggal: 2026-11-02 (Asia/Jakarta)

## Perilaku

- Tombol **Harga** pada kartu keranjang POS membuka **Ubah Harga Nota**.
- Pengguna dengan izin edit produk dapat mengisi harga per satuan, melihat harga otomatis dan hasil pembulatan toko, lalu memilih **Terapkan harga**.
- Harga hanya berlaku untuk baris produk pada nota tersebut. Aksi ini tidak menulis harga jual, Harga Agen, atau Harga Dinas pada data produk dan tidak membuat riwayat perubahan harga produk.
- Harga custom tetap tersedia saat pengaturan Harga Khusus nonaktif. Harga otomatis tetap mengikuti prioritas member, aturan aktif, dan harga jual yang berlaku.
- **Kembalikan harga otomatis** menghapus override dari keranjang dan memakai hasil harga otomatis terbaru.
- Nota berikutnya memakai harga otomatis. Harga custom tidak diwariskan ke transaksi baru.
- Badge amber **Harga custom** ditampilkan di keranjang, pembayaran, dan ringkasan internal pada detail riwayat, termasuk draft. Penanda tidak ikut area cetak atau PDF.

## Tampilan

Dialog menampilkan identitas produk, jumlah dan satuan, kolom harga utama, acuan harga otomatis, penjelasan cakupan satu nota, serta subtotal langsung. Peringatan harga di bawah HPP tetap tersedia. Tombol reset dan tombol utama dibedakan; layout diuji pada lebar 390 px dan 1280 px.

## Penyimpanan dan izin

- `transactionPrice` menyimpan intent harga pada keranjang dan payload transaksi. Nilai harus positif dan terbatas pada batas nominal transaksi yang berlaku.
- Jalur online, draft, sinkronisasi offline, dan persetujuan memakai harga custom tersebut tanpa menulis data produk.
- Snapshot item memakai `pricingRuleId: "transaction-custom-price"` dengan kolom snapshot harga yang sudah tersedia. Tidak diperlukan migrasi skema.
- `originalUnitPrice` merekam harga otomatis sebagai acuan; `appliedUnitPrice` merekam hasil harga custom sesuai pembulatan. Harga custom yang sama nominalnya dengan harga otomatis tetap memiliki penanda.
- Izin `product.update` tetap diperlukan untuk aksi keranjang. Izin harga manual pelanggan yang telah tersedia pada pembayaran tetap mengikuti aturan sebelumnya. Sinkronisasi offline mempertahankan pemeriksaan izin dan alur persetujuan.
- Pada persetujuan draft, intent `AUTOMATIC` menghapus harga custom tersimpan; intent manual mempertahankan atau mengganti nominal yang diminta.
- Perubahan nominal custom saat persetujuan memerlukan izin edit harga; mempertahankan snapshot tersimpan tidak memerlukan izin mengubah nominal. Endpoint pratinjau, persetujuan, dan persetujuan draft memakai pemeriksaan yang sama, termasuk saat menghitung ulang di dalam transaksi database.
- Input custom baru tetap harus positif. Snapshot nol yang merupakan hasil pembulatan input positif dapat dipertahankan saat persetujuan.
- Snapshot pada sinkronisasi offline dibedakan per identitas baris dan harga custom agar baris produk yang sama tidak saling mewarisi penanda.

## Dokumentasi terkait

Bantuan POS, FAQ, panduan AI Assistant, workflow transaksi POS, dan Catatan Perubahan diperbarui bersama fitur. Screenshot dialog memakai produk contoh tanpa data pelanggan.

## Verifikasi

- Tes unit dan integrasi memeriksa harga custom saat Harga Khusus nonaktif, reset harga terbaru, nota berikutnya, intent dengan nominal sama, validasi nominal, izin, draft, offline, persetujuan, dan penanda di luar area cetak.
- Browser memeriksa penerapan dan reset harga, badge, ukuran dialog ponsel/desktop, serta tidak adanya permintaan perubahan data produk.
- TypeScript dan lint dijalankan pada kode terkait. Tidak menjalankan build produksi atau mengubah siklus server pengembangan.
- Review kode menemukan dua kasus tambahan: perubahan nominal tanpa izin pada tahap persetujuan dan pemulihan snapshot nol hasil pembulatan. Keduanya direproduksi lewat tes yang gagal sebelum perbaikan, lalu ditutup dengan tes service dan endpoint.

Hasil verifikasi akhir: **479 tes lulus pada 28 suite** (`output/custom-price-final-complete.log`). Browser harga nota pada lebar 390/1280 px, editor harga grup, serta 21 skenario editor harga member juga lulus. TypeScript (`tsc --noEmit --incremental false`) dan lint file produksi terkait selesai dengan exit code 0. Screenshot final tersedia di `apps/web/public/images/changelog/harga-custom-nota.png`.

Tiga kegagalan tes lama juga dikonfirmasi dengan baseline sebelum perubahan: satu skenario desimal pada `item-discount-core.test.ts` memakai pembulatan default sehingga Rp99,99 menjadi Rp500; dua tes `special-pricing-margins-help.test.ts` mencari frasa lama “lebih spesifik”. Kegagalan tersebut bukan regresi fitur harga custom dan dicatat terpisah dari verifikasi fitur.

## Catatan lingkungan

Dokumen disimpan pada `markdown-files` di checkout aktif `C:\Projects\pos-system-monorepo`; lokasi lama `D:\main_project\pos-system-monorepo\markdown-files` tidak tersedia pada mesin ini.

Headroom stats diperiksa. Pengiriman source internal ke kompresi Headroom ditolak automatic approval review, sehingga inspeksi memakai keluaran lokal terbatas. GitNexus MCP tidak tersedia; analisis dampak memakai CLI lokal dan indeks yang tersedia. Percobaan pembaruan indeks berhenti karena kegagalan worker. Dampak tinggi pada komponen detail nota ditangani dengan ringkasan terpisah di luar area cetak dan tes keluaran cetak.
