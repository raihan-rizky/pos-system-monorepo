# Rencana Implementasi Penyelarasan Arus Kas

> **Untuk pelaksana:** Gunakan `superpowers:executing-plans` untuk mengerjakan tiap tugas berurutan. Langkah menggunakan kotak centang untuk pelacakan.

**Tujuan:** Menyamakan Net Cash Flow dengan Pemasukan dan Pengeluaran yang ditampilkan, mengakui giro sesuai pembayaran dan jatuh tempo terbaru, dan menjelaskan komponen perhitungannya.

**Arsitektur:** Bangun proyeksi pengeluaran bersama dari pengeluaran manual, jadwal pembelian, pembayaran, dan koreksi. Gunakan proyeksi dan pemasukan yang sama pada ringkasan, grafik, daftar, dan rincian, dengan pengambilan data yang menjaga batas toko dan izin. Hitung seluruh nominal dalam sen dan pisahkan data yang tidak lengkap.

**Teknologi:** TypeScript, Next.js, Prisma/PostgreSQL, React Query, Vitest.

**Rancangan:** `markdown-files/arus-kas-jatuh-tempo-design-2026-11-16.md`.

## Batas bersama

- Mulai dari `origin/dev` terbaru di worktree terisolasi memakai `superpowers:using-git-worktrees`; jangan mengubah worktree utama yang berisi perubahan pengguna.
- Pengeluaran giro: pembayaran sebelum/pada jatuh tempo pada tanggal pembayaran; sisa pada jatuh tempo; pembayaran sesudahnya tidak dicatat ulang.
- Pemasukan menyertakan pelunasan piutang manual. Net = pemasukan yang terlihat − pengeluaran yang terlihat.
- Tanggal memakai Asia/Jakarta. Jangan memasukkan sisa giro sebelum tanggal jatuh tempo tiba. Pembayaran, koreksi, dan jadwal historis tidak ditulis ulang.
- Pertahankan filter toko, pemeriksaan izin server, kontrol UI, paginasi, kategori, dukungan data lama, dan laporan kas aktual. Jangan menjalankan `pnpm build`, `pnpm dev`, atau menghentikan server.
- Perubahan perilaku ini memerlukan dokumentasi, Bantuan, katalog alur bila prosedur berubah, dan Catatan Perubahan berbahasa Indonesia.

## Fokus tinjauan

- Jadwal dipindah setelah tanggal lama lewat: periode lama dihitung dari jadwal terbaru dan pembayaran yang benar-benar terjadi.
- Pembayaran sesudah jatuh tempo atau koreksi dengan kelebihan bayar: jangan hilangkan uang yang sudah dibayar atau menghitungnya dua kali.
- Beberapa giro, transfer, dan pembayaran agregat tanpa tautan jadwal: alokasi deterministis dan dapat dijelaskan.
- Riwayat belum diverifikasi, sumber lama ambigu, atau data tidak cocok: hasil ditandai belum lengkap, tidak diam-diam dianggap pasti.
- Akses hanya pemasukan, hanya pengeluaran, pindah toko, dan pergantian cache: data sensitif tetap tertutup dan angka yang tampak konsisten.

## Tugas 1: Proyeksi pengakuan pembayaran pembelian

**Berkas:**

- Buat `apps/web/features/keuangan/helpers/purchase-expense-recognition.ts`.
- Buat `apps/web/features/keuangan/helpers/__tests__/purchase-expense-recognition.test.ts`.
- Baca aturan koreksi di `apps/web/features/suppliers/shopping-requests/repositories/shopping-request-correction-finance.ts` dan pengakuan belanja terdahulu di `apps/web/features/suppliers/backdated-purchases/helpers/backdated-purchase-accounting.ts`.

**Antarmuka:** Ekspor `recognizePurchaseExpenses(input)` dengan input jadwal ber-ID, pembayaran ber-ID dan tanggal, alokasi koreksi yang tersedia, nilai pembelian terkoreksi, serta `asOf` dalam tanggal WIB. Hasil berisi baris stabil bertanggal, nominal dalam sen, jenis `transfer`, `giro_payment`, `giro_due`, atau `overpayment`, referensi sumber, penanda alokasi sistem, dan alasan ketidaklengkapan. Tipe input dan output diekspor untuk tugas berikutnya.

- [ ] Tulis tes perilaku Rp100.000 jatuh tempo Desember, dibayar Rp30.000 November: November Rp30.000, Desember Rp70.000, pembayaran akhir Rp70.000 tidak menambah pengeluaran. Jalankan dan pastikan gagal karena fungsi belum ada.
- [ ] Implementasikan fungsi murni dan jalankan kembali tes sampai lulus.
- [ ] Tambahkan tes dan implementasi bertahap untuk perubahan tanggal lintas bulan dan dalam bulan yang sama, pembayaran tepat saat jatuh tempo, dua giro dan transfer campuran, alokasi pembayaran paling awal dengan seri ID stabil, dan batas WIB.
- [ ] Tambahkan tes koreksi pembelian Rp100.000 menjadi Rp70.000 setelah dibayar Rp100.000: Rp70.000 bagian pembelian + Rp30.000 kelebihan pembayaran; riwayat belum diverifikasi dan jadwal ambigu ditandai tidak lengkap. Jalankan tes fungsi setelah tiap siklus merah/hijau.
- [ ] Jalankan `pnpm --filter @pos/web exec vitest run features/keuangan/helpers/__tests__/purchase-expense-recognition.test.ts` dan pastikan seluruh kasus lulus.

## Tugas 2: Sumber data dan ringkasan keuangan yang konsisten

**Berkas:**

- Buat `apps/web/features/keuangan/services/recognized-finance.ts` dan tes terarah di `apps/web/features/keuangan/services/__tests__/recognized-finance.test.ts`.
- Ubah `apps/web/app/api/finance/cash-flow/summary/route.ts`, `apps/web/app/api/finance/income/summary/route.ts`, dan `apps/web/app/api/finance/expenses/summary/route.ts`.
- Ubah atau tambah tes di `apps/web/app/api/finance/cash-flow/summary/__tests__/`, `apps/web/app/api/finance/income/__tests__/`, dan `apps/web/app/api/finance/expenses/__tests__/`.

**Antarmuka:** `loadRecognizedFinance` menerima toko, rentang bulan, waktu WIB, serta bagian pemasukan/pengeluaran yang diizinkan; hasil memiliki baris bertanggal, total dan komponen bersen, kategori, jumlah entri, dan status lengkap. API gabungan mengembalikan komponen tersebut dari penghitungan yang sama; API parsial tetap melayani peran yang memiliki hanya salah satu izin.

- [ ] Tulis tes API bahwa pemasukan penjualan Rp100.000 + pelunasan piutang manual Rp30.000, pengeluaran manual Rp20.000 + pengakuan giro Rp10.000 menghasilkan Pemasukan Rp130.000, Pengeluaran Rp30.000, dan Net Rp100.000; komponen dan harian menjumlah sama. Pastikan tes gagal pada implementasi lama.
- [ ] Bangun pembacaan terikat toko dan periode yang menggunakan proyeksi Tugas 1 serta sumber pemasukan yang ada. Gunakan snapshot konsisten untuk data yang saling bergantung, tanpa kueri per hari atau per baris.
- [ ] Sesuaikan ketiga API agar nilai dan komponen tidak memakai dasar berbeda; pastikan peran tanpa `income.read` atau `expense.read` hanya menerima bagian yang diizinkan dan detail piutang mengikuti izin yang ada.
- [ ] Uji data yang diketahui tidak lengkap, nilai sen, bulan lampau, bulan berjalan, isolasi toko, izin ditolak, dan perubahan jadwal terbaru. Pastikan laporan kas aktual tidak berubah.
- [ ] Jalankan tes service dan tes API terkait sampai lulus, termasuk tes rekonsiliasi yang sudah ada.

## Tugas 3: Riwayat pengeluaran dan sinkronisasi cache

**Berkas:**

- Ubah `apps/web/app/api/finance/expenses/route.ts` dan tes pada `apps/web/app/api/finance/expenses/__tests__/`.
- Ubah `apps/web/features/keuangan/hooks/useKeuangan.ts` dan hook mutasi koreksi Daftar Belanja yang relevan.
- Ubah `apps/web/app/(main)/keuangan/page.tsx` untuk memakai sumber ringkasan yang konsisten.

**Antarmuka:** Baris hasil Tugas 2 dipetakan ke kontrak daftar pengeluaran dengan ID stabil dan jenis sumber pembayaran atau jatuh tempo. Baris otomatis tetap terlindungi dari edit/hapus; baris manual mempertahankan kontrak dan aksinya.

- [ ] Tulis tes bahwa giro yang jatuh temponya dipindah dari November ke Desember hilang dari daftar dan total November kecuali ada pembayaran November; sisa muncul di Desember setelah tanggalnya. Pastikan tes gagal sebelum implementasi.
- [ ] Gabungkan baris pengeluaran manual dan proyeksi pembelian dengan pengurutan deterministis, filter kategori, jumlah, serta paginasi yang benar sebelum merespons API.
- [ ] Pastikan ringkasan, daftar, dan grafik diperbarui setelah koreksi atau pembayaran, dan pergantian pengguna/toko/izin tidak memakai cache lama.
- [ ] Uji banyak halaman, beberapa giro pada satu pembelian, tanggal WIB, entri otomatis yang tidak dapat diubah/hapus, dan keadaan akses parsial. Jalankan tes route dan cache yang relevan.

## Tugas 4: Rincian cara angka dihitung

**Berkas:**

- Ubah `apps/web/app/(main)/keuangan/page.tsx` dan `apps/web/features/keuangan/components/IncomeDayRow.tsx`.
- Buat komponen kecil `apps/web/features/keuangan/components/FinanceCalculationDetails.tsx` beserta tes perilaku di `apps/web/features/keuangan/components/__tests__/finance-calculation-details.test.tsx`.
- Perbarui rincian pemasukan harian yang ada agar porsi piutang manual terlihat sesuai izin.

**Antarmuka:** Komponen menerima komponen nominal yang sudah dihitung Tugas 2, status lengkap, dan mata uang; komponen tidak menghitung ulang data sumber. Tampilan memperlihatkan rumus Net = Pemasukan − Pengeluaran dan komponen yang bila dijumlahkan sama dengan kedua kartu.

- [ ] Tulis tes tampilan untuk penjualan, pemasukan manual, piutang manual, pengeluaran manual, transfer, pembayaran giro, sisa jatuh tempo, dan kelebihan bayar. Pastikan tes gagal sebelum komponen dibuat.
- [ ] Implementasikan rincian yang dapat dibuka, penjelasan persentase kategori, dan penanda pengakuan giro berdasar jadwal serta alokasi otomatis. Berikan nama yang jelas untuk jumlah nota dibanding jumlah pembayaran.
- [ ] Uji nilai belum lengkap, peran terbatas, kesalahan pemuatan, navigasi keyboard, dan layar sempit; pastikan daftar, grafik, kartu, dan rincian memakai nilai yang sama.

## Tugas 5: Dokumentasi dan pemeriksaan akhir

**Berkas:**

- Perbarui `apps/web/features/help-documentation/components/HelpContent.tsx`, `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`, dan dokumen bantuan terkait.
- Perbarui `apps/web/features/changelog/data/changelog.ts` dengan tanggal aktual WIB, ID unik, revisi, manfaat, rute, tiga langkah, highlight, dan ilustrasi yang tepat.
- Salin rancangan dan rencana ke `markdown-files` pada worktree hasil; karena direktori ini diabaikan Git, pastikan kedua dokumen benar-benar disertakan dalam hasil yang dapat ditinjau.

- [ ] Tulis dokumentasi rumus dan contoh pembayaran sebagian, koreksi jatuh tempo, alokasi otomatis, data belum lengkap, dan kelebihan pembayaran; selaraskan Bantuan dan alur Asisten AI.
- [ ] Jalankan tes terarah seluruh tugas, tes akses yang relevan, `pnpm test`, pemeriksaan tipe/lint yang sesuai, serta `git diff --check`. Laporkan kegagalan yang sudah ada secara terpisah.
- [ ] Tinjau perubahan terhadap rancangan, dampak GitNexus sebelum mengubah setiap simbol, dan hasil aktual. Jangan membuat commit atau mendorong cabang kecuali diminta.
