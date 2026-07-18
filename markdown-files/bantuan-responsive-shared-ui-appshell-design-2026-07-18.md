# Desain AppShell Preview Bantuan Berbasis Shared UI Responsif

Tanggal: 18 Juli 2026

## Status

Desain telah divalidasi, disetujui pengguna, dan memperoleh disposition **APPROVED** dari structured multi-agent review. Dokumen ini menjadi acuan implementasi untuk mengganti seluruh AppShell preview pada halaman Bantuan.

## Ringkasan Pemahaman

- Seluruh 12 AppShell preview Bantuan harus diselaraskan dengan UI aplikasi terbaru.
- Komponen presentasional diekstrak dari halaman produksi dan menjadi sumber UI bersama bagi aplikasi serta preview.
- Preview tetap read-only, memakai data sintetis, tanpa API, navigasi aktif, atau mutasi bisnis.
- Preview otomatis responsif mengikuti perangkat pengguna: desktop, tablet, atau mobile, tanpa pemilih perangkat.
- Setiap langkah mengatur state UI yang sesuai lalu menampilkan overlay unik berupa highlight, peredupan, panah, nomor, dan callout.
- Pada perangkat sentuh, preview dapat dibuka dalam modal layar penuh dan mendukung pan serta pinch-zoom.
- UI produksi menjadi sumber kebenaran. Judul, urutan, instruksi, target, dan callout yang tidak sesuai harus diperbaiki.
- Target yang hilang harus menggagalkan tes; runtime menampilkan pesan bahwa panduan perlu diperbarui.

## Cakupan

Perubahan mencakup seluruh preview berikut:

1. Pengaturan
2. Riwayat
3. Kasir
4. Produk
5. Inventaris
6. Supplier
7. Pelanggan
8. Keuangan
9. Shift Kasir
10. Produksi
11. Sales
12. AI Assistant

Audit juga mencakup seluruh langkah Bantuan yang terkait dengan preview tersebut. Jika perubahan langkah menyentuh guided workflow AI Assistant, katalog workflow, FAQ terkait, dan pengujiannya harus ikut diselaraskan.

## Asumsi dan Non-Goal

### Asumsi

- Sasaran pengguna mencakup seluruh role yang memiliki akses ke Bantuan.
- Refactor halaman produksi hanya memisahkan UI presentasional; behavior dan data flow produksi tetap sama.
- Hanya fitur dan langkah aktif yang dimuat.
- Fixture sepenuhnya sintetis, realistis, dan deterministik.
- Reduced-motion, navigasi keyboard, fokus modal, dan label screen reader tetap didukung.
- Kontrak UI dan tes behavior merupakan standar fidelity.
- Fitur asal memiliki shared view dan kontrak target; modul Bantuan memiliki fixture, scenario, overlay, dan isi panduan.

### Non-Goal

- Tidak membuat screenshot pixel-perfect atau visual-regression berbasis gambar.
- Tidak merender route produksi langsung di dalam Bantuan.
- Tidak menghubungkan preview dengan API, session, cache, database, upload, pembayaran, WhatsApp, atau mutasi bisnis.
- Tidak menyediakan pemilih Desktop/Tablet/Mobile manual.
- Tidak mempertahankan langkah lama yang terbukti tidak sesuai dengan UI atau alur produksi.

## Non-Functional Requirements

### Performa

- Gunakan dynamic import per fitur dan render hanya langkah aktif.
- Pergantian langkah pada halaman yang sama tidak memuat ulang shared view tanpa kebutuhan.
- Pengukuran overlay dibatasi per animation frame.
- Resize dan scroll memakai observer atau listener pasif yang dibersihkan saat unmount.
- Modal dan pinch-zoom harus tetap responsif pada ponsel kelas menengah.

### Skala

- Registry wajib exhaustive untuk seluruh 12 halaman dan semua langkah yang dipertahankan.
- Setiap langkah memiliki scenario dan target semantik yang valid.
- Penambahan atau penghapusan target harus memerlukan pembaruan kontrak dan tes.

### Keamanan dan Privasi

- Preview hanya memakai data sintetis lokal.
- Bundle preview tidak boleh mengimpor client API, mutation hook, atau sumber data produksi.
- Link, form, upload, pembayaran, dan aksi eksternal diganti callback demonstrasi lokal.
- Preview tidak membaca data pengguna, role session, cache, atau database.

### Reliabilitas

- Target yang hilang tidak boleh dialihkan diam-diam ke elemen lain.
- Runtime menampilkan pesan panduan tidak tersedia dan mencatat page, step, scenario, serta target.
- Error boundary per fitur menjaga panduan lain tetap dapat digunakan.
- Overlay hanya dihitung setelah shared view dan layout siap.

### Pemeliharaan

- Shared presentational view adalah sumber tampilan tunggal untuk produksi dan Bantuan.
- Target Bantuan memakai ID semantik stabil pada shared view.
- Perubahan UI yang merusak kontrak target harus menggagalkan tes.
- `HelpContent.tsx` harus mengikuti hasil audit langkah.
- `workflow-catalog.ts`, FAQ, dan tes AI diperbarui hanya jika guided workflow terkait berubah.

## Pendekatan yang Dipilih

### Shared Presentational Views dan Preview Adapters

Setiap fitur dipisahkan menjadi tiga lapisan:

```text
Halaman produksi
  `-- Controller produksi
       |-- hooks, API, router, mutation
       `-- Shared Presentational View
              ^
Preview Bantuan
  `-- Preview Adapter
       |-- fixture data
       |-- state scenario
       `-- callback read-only
```

Shared presentational view menerima data, status UI, permission tampilan, dan callback melalui props. View tidak mengambil data atau melakukan mutasi sendiri. Controller produksi mempertahankan seluruh behavior yang ada, sedangkan adapter Bantuan memasok fixture dan state lokal read-only.

Pendekatan ini dipilih dibanding menyusun ulang bagian UI secara khusus atau merender route produksi dengan provider simulasi karena memberi fidelity dan reuse tinggi tanpa membawa side effect produksi ke preview.

## Komponen Arsitektur

### `preview-registry`

Memetakan halaman dan langkah ke shared view, fixture, scenario, target, dan konfigurasi overlay. Registry menggunakan dynamic import per fitur.

### `scenarios`

Mendefinisikan state representatif per langkah, termasuk tab aktif, record terpilih, menu terbuka, modal, drawer, filter, dan variasi layout responsif.

### `HelpPreviewShell`

Container responsif yang merender shared view pada lebar aktual perangkat. Shell tidak lagi bergantung pada kanvas logis tetap 1366 x 768.

### `GuideOverlay`

Mengukur target aktual dan menggambar spotlight, peredupan, panah, nomor langkah, serta callout tanpa mengubah layout atau styling shared view.

### `HelpVisualModal`

Memberikan tampilan layar penuh pada perangkat sentuh, focus trap, pan, pinch-zoom, kontrol langkah, dan pengembalian fokus saat ditutup.

### `UnavailableGuideState`

Menampilkan pesan ramah ketika target tidak dapat ditemukan dan menyediakan metadata diagnosis tanpa memberi fallback yang menyesatkan.

## Responsivitas dan Overlay

View dirender pada lebar container aktual sehingga memakai breakpoint yang sama dengan aplikasi. Perubahan ukuran viewport atau orientasi dihitung ulang dengan `ResizeObserver`.

Setiap langkah memiliki konfigurasi overlay tersendiri:

```ts
{
  target: "history-action-menu",
  placement: "left",
  emphasis: "spotlight",
  arrow: "curved",
  dimBackground: true,
}
```

Urutan perpindahan langkah:

1. Adapter mengaktifkan state scenario.
2. Sistem menunggu target selesai dirender.
3. Container melakukan auto-scroll agar target terlihat.
4. Overlay memilih penempatan aman dan menampilkan highlight unik untuk langkah tersebut.
5. Animasi mengikuti preferensi reduced-motion pengguna.

Pada perangkat sentuh, ketukan pada preview membuka modal layar penuh. Isi modal dapat di-pan dan pinch-zoom, sedangkan kontrol langkah dan callout berada pada lapisan stabil.

## Kontrak Langkah dan Audit Akurasi

Setiap langkah menggunakan kontrak terstruktur:

```ts
{
  id: "history-open-action-menu",
  title: "Buka menu tindakan",
  instruction: "Pilih ikon tiga titik pada transaksi yang ingin dikelola.",
  page: "history",
  scenario: "transaction-list-with-action-menu",
  target: "history-action-menu",
  overlay: { placement: "left", arrow: "curved" },
}
```

Proses audit:

1. Inventarisasi step dan target saat ini.
2. Cocokkan setiap step dengan shared view dan alur produksi aktual.
3. Perbaiki judul, instruksi, urutan, target, dan callout yang tidak akurat.
4. Hapus step usang dan tambahkan step yang diperlukan untuk menutup celah alur.
5. Pastikan setiap scenario hanya menampilkan state yang mungkin terjadi di aplikasi.
6. Sinkronkan `HelpContent.tsx`.
7. Jika guided workflow AI terdampak, sinkronkan `workflow-catalog.ts`, FAQ, dan tesnya.

## Aksesibilitas

- Target aktif terhubung ke callout melalui `aria-describedby`.
- Perpindahan langkah diumumkan melalui live region tanpa mengambil fokus secara agresif.
- Modal, kontrol langkah, dan tombol tutup dapat digunakan dengan keyboard.
- Focus trap aktif dalam modal dan fokus dikembalikan ke pemicu saat modal ditutup.
- Panah selalu disertai teks; informasi tidak bergantung pada warna atau bentuk saja.
- Highlight menggunakan kontras memadai.
- Reduced-motion menghilangkan transisi besar tanpa menghilangkan perubahan state.
- Target sentuh dan kontrol modal memakai ukuran minimum yang aman.

## Strategi TDD

Tes kontrak baru harus ditulis dan diverifikasi gagal sebelum implementasi.

- Contract test: seluruh halaman, step, scenario, dan target terdaftar lengkap.
- Shared-view test: controller produksi dan adapter Bantuan memakai view yang sama.
- Scenario test: state UI yang benar aktif pada setiap langkah.
- Overlay test: highlight unik, panah, callout, auto-scroll, resize, dan target hilang.
- Responsive test: desktop, tablet, mobile, serta perubahan orientasi.
- Accessibility test: keyboard, focus trap, live region, label, dan reduced-motion.
- Safety test: melarang API, mutation hook, router aktif, dan data produksi dalam preview.
- Regression test: mengunci isi dan urutan langkah yang telah diaudit serta workflow AI yang terdampak.

Verifikasi implementasi tidak boleh memakai `pnpm build` dan tidak boleh memulai atau menghentikan development server.

## Strategi Migrasi

Perubahan dirilis sebagai satu penyelarasan menyeluruh, tetapi dikerjakan secara internal per fitur:

1. Bangun fondasi shared-view, registry, scenario, dan overlay.
2. Migrasikan satu halaman sebagai reference implementation.
3. Verifikasi controller produksi tidak berubah behavior.
4. Migrasikan sebelas halaman lain secara berurutan.
5. Audit dan koreksi seluruh langkah Bantuan.
6. Sinkronkan workflow AI jika terdampak.
7. Jalankan suite Bantuan, suite fitur terkait, lint relevan, dan type-check.
8. Perbarui dokumentasi implementasi.

## Risiko dan Mitigasi

| Risiko | Mitigasi |
| --- | --- |
| Refactor mengubah behavior produksi | Tambahkan characterization test sebelum ekstraksi dan pertahankan controller |
| Props shared view terlalu besar | Kelompokkan props berdasarkan data, state UI, permission, dan action |
| Target overlay drift | Gunakan target semantik dan contract test wajib |
| Scenario tidak menyerupai alur nyata | Audit terhadap controller dan state produksi |
| Bundle Bantuan membesar | Dynamic import per fitur dan render langkah aktif |
| Overlay salah posisi pada layout responsif | Gunakan `ResizeObserver`, auto-placement, dan tes tiga breakpoint |
| Gesture zoom berbenturan dengan scroll | Aktifkan gesture hanya dalam modal layar penuh |
| Dokumentasi dan AI tidak sinkron | Audit silang HelpContent, registry, FAQ, dan katalog workflow |

## Decision Log

| Keputusan | Alternatif yang Dipertimbangkan | Alasan |
| --- | --- | --- |
| Shared presentational views menjadi sumber UI tunggal | Replika khusus; render route live | Fidelity tinggi tanpa side effect produksi |
| Seluruh 12 preview dimigrasikan | Rollout sebagian | Menghindari pengalaman Bantuan yang tidak konsisten |
| Preview otomatis responsif | Kanvas tetap; device switcher | Mengikuti perangkat pengguna secara langsung |
| Preview tetap read-only | Interaksi bisnis asli | Menjaga keamanan dan determinisme |
| Overlay terpisah dari shared view | Styling Bantuan di dalam komponen produksi | UI produksi tetap bersih dan reusable |
| Setiap step memiliki scenario eksplisit | Menggabungkan semua state | Menampilkan konteks yang benar-benar mungkin terjadi |
| UI produksi adalah sumber kebenaran | Mempertahankan step lama | Panduan harus mencerminkan alur nyata |
| Target hilang menggagalkan tes | Fallback ke target utama; melewati langkah | Mencegah instruksi yang menyesatkan |
| Fidelity diuji secara struktural dan behavioral | Screenshot pixel-perfect | Lebih stabil dan fokus pada fungsi nyata |
| Migrasi internal per fitur, rilis menyeluruh | Refactor sekaligus tanpa checkpoint | Membatasi risiko sambil menjaga cakupan akhir |

## Acceptance Criteria

- Seluruh 12 preview menggunakan shared presentational view dari fitur produksinya.
- Produksi dan Bantuan menampilkan struktur, komponen, breakpoint, teks, ikon, dan state yang konsisten.
- Preview desktop, tablet, dan mobile mengikuti lebar perangkat secara otomatis.
- Setiap step memiliki highlight, panah, callout, dan scenario yang sesuai.
- State UI berubah otomatis agar target langkah tampil dalam konteks benar.
- Step yang tidak akurat telah diperbaiki berdasarkan UI dan alur produksi.
- Modal perangkat sentuh mendukung pan dan pinch-zoom.
- Preview tidak melakukan API call, navigasi aktif, upload, atau mutasi bisnis.
- Target hilang menyebabkan kegagalan tes dan pesan runtime eksplisit.
- Tes Bantuan, tes fitur terkait, lint relevan, dan type-check lulus.
- Dokumentasi Bantuan dan guided workflow AI yang terdampak tetap sinkron.

## Addendum Structured Multi-Agent Review

Review berurutan dilakukan sebelum implementasi oleh Skeptic/Challenger, Constraint Guardian, dan User Advocate. Revisi berikut menjadi bagian normatif desain.

### Klarifikasi Arsitektur dan Responsif

- Shared UI mencakup chrome AppShell produksi yang relevan: navigation, header, responsive drawer, content frame, dan floating assistant affordance. Bantuan tidak mempertahankan replika chrome terpisah.
- Breakpoint ditentukan dari viewport perangkat/AppShell tingkat atas, bukan lebar kolom artikel Bantuan. Layout logis yang dihasilkan boleh diskalakan agar muat di preview tanpa mengubah breakpoint-nya.
- Preview menyediakan portal host terisolasi untuk menu, popover, drawer, tooltip, dan dialog. Portal tidak boleh lolos ke `document.body` saat berada dalam preview.
- Shared view untuk fitur yang sama mempertahankan component identity ketika step berganti. Remount hanya terjadi ketika berpindah fitur atau diwajibkan secara eksplisit oleh scenario.

### Kontrak Target dan Scenario

- Setiap scenario harus menghasilkan tepat satu target yang terlihat, berukuran lebih dari nol, dan tidak tertutup. Target berulang memakai instance key atau scope record eksplisit.
- Target pada nested scroll container harus dibuat terlihat dengan scroll resolver yang memperhitungkan scroll horizontal, scroll vertikal, sticky header, dan occlusion.
- Readiness baru tercapai setelah scenario committed, portal mounted, font/layout stabil, dan target memiliki geometri stabil. Timeout bersifat deterministik dan diuji.
- Setiap step mendeklarasikan role/permission yang berlaku. Tes mencakup seluruh role yang berlaku dan hanya variasi permission/layout yang secara material berbeda.
- Audit manual per step menyimpan bukti hubungan antara instruction, scenario, target, role, dan alur produksi. Tes kontrak kemudian menjaga mapping yang sudah disetujui.
- Legacy primary-target fallback dihapus setelah seluruh step dimigrasikan. Unknown mapping gagal pada tes dan menghasilkan `UnavailableGuideState` saat runtime.

### Keamanan dan Preservasi Produksi

- Audit read-only mencakup dependency transitif shared descendants, bukan hanya import langsung.
- Browser test memastikan interaksi preview menghasilkan nol network request, navigation, storage write, upload, dan external launch.
- Logging diagnosis hanya memuat identifier teknis, tidak memuat fixture atau data pengguna.
- Setiap controller produksi memperoleh characterization test sebelum ekstraksi, meliputi rendered state, callback, permission, responsive variant, dan portal behavior yang relevan.
- Setiap fitur wajib melewati migration gate sendiri sebelum implementasi legacy fitur tersebut dilepas, walaupun delivery akhir tetap mencakup seluruh 12 preview.

### UX, Copy, dan Aksesibilitas

- Preview inline bersifat satu affordance noninteraktif untuk membuka modal. Kontrol semu di dalamnya tidak masuk urutan fokus dan tidak diumumkan sebagai kontrol aktif.
- Instruksi menjelaskan tindakan yang pengguna lakukan **di aplikasi**, bukan memerintahkan pengguna mengoperasikan preview.
- Setiap step memiliki satu tujuan, satu target utama, dan copy singkat. “Highlight berbeda” berarti target/geometri/callout berbeda, bukan dekorasi visual arbitrer.
- Record berulang yang disorot harus disebut atau dikenali secara konsisten dalam callout.
- Perubahan tab, modal, drawer, atau record antar-step harus mempunyai urutan dan copy transisi yang menjelaskan perubahan konteks.
- Target dan callout harus tetap terbaca tanpa zoom wajib. Zoom merupakan bantuan inspeksi tambahan.
- `UnavailableGuideState` mempertahankan identitas panduan/step, menegaskan bahwa masalah bukan kesalahan pengguna, dan menyediakan aksi aman untuk menutup modal atau kembali ke daftar panduan.
- `aria-describedby` digabung dengan nilai yang sudah ada dan dipulihkan saat step berubah/unmount. Preview modal mencegah nested focus trap.

### Gesture dan Browser-Level Testing

- Zoom modal dibatasi 1x sampai 3x, pan dijepit ke batas konten, background scroll dikunci, dan pointer cancellation ditangani.
- Zoom/pan kembali ke keadaan awal saat step berubah, modal ditutup, atau orientasi/ukuran berubah.
- Relasi visual target-callout dipertahankan saat transform; kontrol modal tetap stabil.
- Playwright menguji geometri overlay, portal containment, sticky occlusion, focus trap, orientasi, touch, pan, dan pinch pada viewport desktop, tablet, dan mobile representatif.
- Component tests tetap menangani pemeriksaan exhaustive registry/scenario agar biaya browser test tetap terbatas.

### Performance Gates

Baseline diukur sebelum migrasi pada environment CI yang sama. Implementasi menetapkan dan mendokumentasikan batas regresi untuk:

- initial Help JavaScript;
- lazy chunk preview aktif;
- waktu dari pergantian step sampai overlay stabil;
- waktu buka modal;
- long task selama pan, pinch, resize, dan pergantian step;
- layout jump saat overlay muncul.

Budget numerik final ditetapkan dari baseline repository dan diuji secara reproducible; profiling perangkat kelas menengah menjadi release check terdokumentasi.

### Decision Log Review

| Keberatan | Keputusan | Resolusi |
| --- | --- | --- |
| Chrome AppShell masih dapat drift | Diterima | Reuse chrome produksi atau shared shell contract menjadi wajib |
| Lebar container tidak sama dengan device breakpoint | Diterima | Gunakan viewport/AppShell tingkat atas lalu fit layout logis |
| Portal dapat keluar dari preview | Diterima | Scoped portal host dan larangan nested focus trap |
| Target dapat ganda, tersembunyi, atau salah record | Diterima | Tepat satu visible target dengan instance/scope eksplisit |
| Keberadaan target tidak membuktikan akurasi step | Diterima | Audit evidence per step sebelum contract test mengunci mapping |
| Variasi role tidak terdefinisi | Diterima | `applicableRoles` dan matrix variasi material |
| Readiness dan nested scroll nondeterministik | Diterima | Stable-layout contract, deterministic timeout, nested scroll resolver |
| Read-only tidak terjamin secara transitif | Diterima | Dependency/effect audit dan zero-side-effect browser assertion |
| Refactor 12 fitur berisiko mengubah produksi | Diterima | Characterization test dan migration gate per fitur |
| DOM test tidak cukup | Diterima | Tambahkan Playwright terfokus pada perilaku browser nyata |
| Instruksi preview berkonflik dengan affordance modal | Diterima | Copy selalu merujuk tindakan di aplikasi; inline preview satu affordance |
| Full shell terlalu padat di mobile | Diterima | Keterbacaan tanpa zoom menjadi acceptance gate |
| Scenario antar-step dapat terasa melompat | Diterima | Urutan/copy transisi wajib menjelaskan perubahan konteks |
| Pesan target hilang membuat pengguna buntu | Diterima | Pesan kontekstual dengan aksi kembali/tutup yang aman |
| Overlay metadata berpotensi berlebihan | Diterima sebagian | Pertahankan hanya metadata yang terbukti diperlukan dari audit |
| Semua 12 halaman dalam satu delivery memperbesar blast radius | Diterima sebagian | Delivery akhir tetap menyeluruh sesuai scope; migration gate diterapkan per fitur |
| Highlight berbeda dapat berarti dekorasi arbitrer | Ditolak sebagai interpretasi | Maksud dikunci sebagai target/geometri/callout berbeda, bukan style berbeda |
| Fixture realistis dapat menjadi implementasi paralel | Diterima | Fixture dibatasi pada record minimum dan konteks kredibel |

### Disposition Arbiter

**APPROVED** — seluruh keberatan material telah diterima, dibatasi, atau ditolak dengan alasan yang terdokumentasi. Tidak ada blocker desain tersisa sebelum implementasi. Budget performa numerik wajib ditetapkan dari baseline repository yang reproducible sebelum release, bukan ditebak pada tahap desain.

## Status Implementasi AppShell

Fondasi AppShell preview telah diimplementasikan pada 18 Juli 2026.

### Perubahan yang Diterapkan

- Kontrak navigasi produksi dipindahkan ke `components/app-shell/app-shell-navigation.ts` dan dipakai bersama oleh `Sidebar` produksi serta AppShell preview Bantuan.
- AppShell preview tidak lagi memakai kanvas desktop tetap 1366 x 768. Chrome desktop dan mobile mengikuti breakpoint viewport perangkat secara otomatis.
- Seluruh 12 renderer preview melewati root responsif bersama dengan overflow internal serta auto-scroll target yang terlihat dan unik.
- Preview inline menjadi satu affordance noninteraktif untuk membuka modal; kontrol semu di dalam preview tidak masuk accessibility tree.
- Modal mengunci background scroll, mengembalikan fokus ke pemicu, dan mendukung pan/pinch zoom 1x–3x dengan reset saat step atau orientasi berubah.
- Overlay aktif sekarang memiliki spotlight, panah, nomor langkah, callout semantik, dan relasi `aria-describedby`.
- Target eksplisit yang usang tidak memakai fallback diam-diam; runtime menampilkan pesan bahwa panduan sedang disesuaikan.
- Seluruh guide/step mempunyai mapping visual eksplisit dalam `audited-help-step-targets.ts`. Mapping keliru dari inferensi kata kunci telah dikoreksi, termasuk alur laporan, sales, approval stok, Kasir, produksi, dan role lainnya.
- Tips pengguna di halaman Bantuan telah diperbarui untuk perilaku desktop, tablet, dan mobile.

### Catatan Reuse

Reuse produksi pada tahap ini mencakup kontrak dan ikon/navigation chrome AppShell yang sebelumnya diduplikasi. Renderer isi halaman tetap berupa adapter presentasional read-only khusus Bantuan agar tidak membawa hooks, API, provider, mutation, atau side effect dari route produksi. Fidelity 12 permukaan tetap dikunci oleh kontrak semantik terhadap source UI produksi.

### Verifikasi

- `pnpm --filter @pos/web test features/help-documentation/__tests__ 'app/(main)/__tests__/layout.test.ts' app/__tests__/layout.test.ts` — 56 tes lulus.
- `pnpm --filter @pos/web type-check` — lulus.
- `git diff --check` — lulus; hanya peringatan line-ending repository yang sudah ada.
- `pnpm build` tidak dijalankan dan development server tidak dimulai atau dihentikan.

Workflow AI Assistant tidak diubah oleh implementasi AppShell ini. Perubahan workflow upload bukti yang sudah ada di worktree dipertahankan tanpa ditimpa.
