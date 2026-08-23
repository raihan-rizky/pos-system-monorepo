# Production Version Skew Error Recovery

Tanggal: 2026-08-23

## Ringkasan

Saat user berpindah menu di aplikasi production, browser kadang menampilkan halaman error dengan pesan `Cannot read properties of undefined (reading 'call')`. Refresh browser menghilangkan error sementara.

Error tersebut berasal dari Webpack runtime ketika module ID yang diminta tidak tersedia pada module map aktif. Gejalanya menunjukkan version skew: tab masih menjalankan client runtime dari deployment lama, tetapi navigasi menerima route payload atau JavaScript chunk dari deployment yang berbeda.

Service worker memperbesar risiko karena saat ini memakai strategi `cache-first` untuk seluruh `/_next/static/*`. Tombol `Coba Lagi` pada route error boundary juga hanya memanggil `reset()`, sehingga tidak dapat mengganti runtime atau chunk yang sudah tidak konsisten.

## Tujuan

- Mencegah service worker menyajikan runtime dan chunk internal Next.js dari cache aplikasi.
- Memberikan recovery yang sesuai untuk version skew dan error render biasa.
- Memastikan setiap tombol error memiliki behavior yang nyata, dapat dipakai dengan keyboard, dan memiliki focus state yang jelas.
- Menyembunyikan pesan internal yang membingungkan dari user tanpa menghilangkan detail untuk logging.
- Menambahkan regression test untuk kebijakan cache dan pemilihan recovery action.

## Non-Tujuan

- Mengubah alur bisnis pada halaman yang dibuka user.
- Mengubah strategi cache API atau offline transaction queue.
- Menambah dependency baru.
- Menjalankan atau mengubah lifecycle development server.

## Root Cause

Alur kegagalannya adalah:

1. User membuka aplikasi dan mempertahankan tab dari deployment A.
2. Deployment B menjadi production deployment aktif.
3. User melakukan client-side navigation ke menu lain.
4. Runtime, route payload, atau chunk yang dipakai tab berasal dari deployment berbeda.
5. Webpack mencoba menjalankan module factory yang tidak ada pada module map aktif dan melempar error saat membaca `.call`.
6. Route error boundary menangkap error, tetapi `reset()` hanya mencoba render ulang dengan runtime yang sama.
7. Refresh penuh mengambil document dan runtime yang konsisten sehingga aplikasi kembali berjalan.

Service worker saat ini ikut menangani `/_next/static/*` dengan `cache-first`. Jalur ini dapat mengembalikan aset Next.js dari Cache Storage dan melewati mekanisme konsistensi deployment yang disediakan Next.js dan Vercel.

Referensi:

- [Next.js Self-Hosting, Version Skew](https://nextjs.org/docs/app/guides/self-hosting)
- [Vercel Skew Protection](https://vercel.com/docs/skew-protection)

## Desain yang Dipilih

### 1. Pisahkan cache aplikasi dari runtime Next.js

Service worker harus langsung melewatkan seluruh request dengan path `/_next/` tanpa memanggil `respondWith`. Browser dan Vercel menangani request tersebut menggunakan HTTP cache dan deployment routing mereka sendiri.

Cache aplikasi tetap dapat menangani aset yang memang dimiliki aplikasi, seperti icon dan image. Pencarian cache menggunakan cache aktif milik POS, bukan pencarian global ke semua Cache Storage pada origin.

Nama cache dinaikkan dari `pos-v5` ke versi berikutnya. Saat service worker baru aktif, cache POS versi lama dihapus melalui lifecycle `activate` yang sudah tersedia.

### 2. Klasifikasikan error recovery

Helper recovery yang terpisah dan dapat dites mengelompokkan error menjadi:

- Runtime atau deployment mismatch, termasuk `ChunkLoadError`, kegagalan dynamic import, kegagalan loading chunk, dan pesan `Cannot read properties of undefined (reading 'call')`.
- Error render atau data biasa yang tidak cocok dengan signature runtime mismatch.

Classifier hanya menentukan recovery presentation. Detail error asli tetap diberikan kepada logger dan tidak ditampilkan langsung kepada user production.

### 3. Recovery untuk runtime mismatch

Error boundary menampilkan pesan:

> Versi aplikasi telah diperbarui. Muat ulang halaman untuk melanjutkan.

Action yang tersedia adalah `Muat Ulang Versi Terbaru`. Action melakukan best-effort cleanup pada cache POS dan meminta update service worker, lalu tetap menjalankan hard reload walaupun salah satu proses cleanup gagal.

Reload hanya berjalan setelah interaksi user. Tidak ada automatic reload loop dari error boundary.

### 4. Recovery untuk error biasa

Error boundary menampilkan pesan umum yang friendly dan menyediakan:

- `Coba Lagi`, memanggil `reset()` untuk merender ulang route segment.
- `Muat Ulang Halaman`, menjalankan hard reload sebagai fallback.

Error digest tetap dapat ditampilkan karena aman untuk kebutuhan support. Raw error message tidak ditampilkan kepada user.

### 5. Interaction dan accessibility

- Semua control memakai elemen `button` dengan `type="button"`.
- Tap target minimum 44px.
- Focus indicator terlihat saat navigasi keyboard.
- Action yang sedang berjalan tidak dapat diklik berulang.
- Label button menjelaskan hasil action, bukan CTA generik.
- Icon hanya mendukung makna reload atau retry dan diberi `aria-hidden` ketika label text sudah cukup.

Design Read: error recovery untuk operator POS, mengikuti visual language error state yang sudah ada, dengan dial ENERGY 1 / RHYTHM 1 / MOTION 1. Tujuannya menjaga situasi error tetap tenang, jelas, dan cepat dipulihkan.

## Data Flow

### Runtime mismatch

1. Next.js menyerahkan error kepada `MainError`.
2. Classifier memeriksa `error.name`, `error.message`, dan cause message bila tersedia.
3. UI menampilkan recovery khusus version mismatch.
4. User menekan `Muat Ulang Versi Terbaru`.
5. Recovery helper membersihkan cache POS dan meminta service worker update secara best effort.
6. Browser melakukan hard reload ke URL aktif.

### Error biasa

1. Next.js menyerahkan error kepada `MainError`.
2. Classifier tidak menemukan signature runtime mismatch.
3. UI menampilkan error umum.
4. `Coba Lagi` memanggil `reset()`.
5. Jika error tetap terjadi, user dapat memilih `Muat Ulang Halaman`.

## Testing Contract

Test ditulis dan dijalankan dalam urutan TDD sebelum implementation code.

- Service worker tidak memanggil `respondWith` untuk request `/_next/*`.
- Service worker tidak menulis response `/_next/*` ke Cache Storage.
- Service worker tetap menangani icon dan image sesuai kebijakan cache aplikasi.
- Activation service worker menghapus cache POS versi lama.
- Classifier mengenali signature `.call`, `ChunkLoadError`, loading chunk, dan dynamic import failure.
- Classifier tidak salah menganggap error render biasa sebagai version mismatch.
- Runtime mismatch memilih hard reload dan tidak menawarkan `reset()` sebagai recovery utama.
- Error biasa menghubungkan `Coba Lagi` ke `reset()` dan menyediakan hard reload fallback.
- Kegagalan cleanup cache atau update service worker tidak mencegah hard reload.
- Error UI merender label Indonesia dan accessibility attribute yang disepakati.

## Verifikasi Vercel

Deployment checklist perlu memastikan:

- Skew Protection aktif pada project Vercel jika tersedia pada plan yang digunakan.
- Automatically expose System Environment Variables aktif.
- Deployment dilakukan melalui Git integration atau workflow Vercel yang mempertahankan deployment identity secara benar.
- Request framework-managed dapat diamati memakai deployment identifier saat Skew Protection aktif.

Perubahan code tetap harus aman saat Skew Protection tidak tersedia. Service-worker bypass dan error recovery tidak bergantung pada plan Vercel.

## Dokumentasi dan Scope

Perubahan ini adalah big bug fix sehingga dokumen implementasi di folder `markdown-files` harus diperbarui setelah hasil final diketahui. Help page tidak berubah karena tidak ada fitur bisnis baru. AI Assistant workflow catalog tidak berubah karena tidak ada guided workflow yang ditambah atau dimodifikasi.

## Acceptance Criteria

- Pindah menu setelah deployment baru tidak menerima aset `/_next/*` dari Cache Storage milik service worker.
- Version mismatch memandu user ke hard reload yang berfungsi.
- Error biasa tetap dapat dicoba ulang tanpa selalu membuang state halaman.
- Tidak ada raw internal error message yang ditampilkan kepada user production.
- Unit test terkait lulus.
- `pnpm lint` dan `pnpm type-check` lulus tanpa menjalankan `pnpm build`.
