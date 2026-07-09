# Bantuan Smooth Animations - 2026-07-09

## Ringkasan

Halaman Bantuan sekarang memakai animasi halus pada panduan visual agar pengguna lebih mudah mengikuti langkah aktif. Animasi dibatasi pada elemen panduan, bukan pada isi data mock, sehingga halaman tetap read-only dan tidak mengubah alur bantuan.

## Perubahan

- `HelpDiagramStepper` menambahkan marker `data-help-stepper-animation="smooth"` dan transisi pada langkah aktif, titik langkah, serta label langkah.
- `VisualGuideMockup` menambahkan marker `data-help-animation="page-preview"` pada kanvas app-shell desktop.
- Target panduan aktif sekarang memakai `transition-all`, durasi singkat, dan marker `data-help-animation="active-target"`.
- Callout bernomor memakai `data-help-overlay-animation="target-callout"` dengan `motion-safe:animate-pulse` agar area yang harus diperhatikan lebih jelas tanpa memaksa animasi pada pengguna yang mengurangi motion.
- Target panduan aktif di sisi kanan memakai `data-help-glow="step-target"` dan token `shadow-glow`, sehingga setiap langkah yang dipilih terlihat lebih menonjol pada preview halaman.
- Overlay nomor langkah memakai `data-help-overlay-glow="step-callout"` dan `data-help-callout-glow="step-number"` agar panah/label yang menunjuk target lebih mudah diikuti.
- Glow pada target aktif sekarang bergerak dengan `data-help-glow-animation="pulse"` dan class `help-step-glow-animated`.
- Glow pada nomor dan label callout bergerak dengan `data-help-overlay-glow-animation="pulse"`, `data-help-callout-glow-animation="pulse"`, dan class `help-step-callout-glow-animated`.
- Animasi glow memiliki fallback `prefers-reduced-motion` sehingga berubah menjadi glow statis ketika pengguna mengurangi motion.
- Panel panduan visual sisi kanan mengikuti `frontend-dev-guidelines`: panel dipisahkan menjadi `HelpGuideVisualPanel`, dibungkus `React.memo`, dan memakai handler `useCallback` untuk membuka modal/pergantian langkah.
- `VisualGuideMockup` sekarang diekspor melalui `React.memo` agar preview app-shell yang berat tidak dirender ulang tanpa perubahan props.
- Scaling preview 1366 x 768 kembali memakai CSS container query (`scale(calc(100cqw / 1366))`) sehingga tidak membutuhkan `ResizeObserver` atau state runtime.
- Kotak ringkasan langkah di bawah preview ikut diberi transisi agar pergantian langkah terasa lebih lembut.
- Panel panduan kanan sekarang memakai `data-help-right-guide-canvas="full-width"` sehingga preview app-shell memanfaatkan lebar area bantuan dan tidak lagi dibatasi `max-w-md`/`lg:max-w-lg`.
- Preview app-shell memiliki guard overflow melalui `data-help-appshell-overflow-guard="true"`, `data-help-page-viewport="clipped"`, `contain: layout paint`, `max-w-full`, dan `will-change-transform`.
- Template Settings dibuat mengikuti struktur halaman asli: wrapper `max-w-[1600px] px-4 md:px-8 pt-6 pb-20`, layout tab `flex flex-col sm:flex-row gap-6`, tab pill, dan panel konten putih `rounded-2xl`.
- Template History tidak lagi memakai header generik `Read-only`; struktur root, header, filter, area scroll, dan tabel desktop sekarang mengikuti halaman Riwayat asli.
- Template History memakai tabel desktop aktual (`hidden md:block overflow-x-auto`, `w-full text-left border-collapse`) dengan kolom Tanggal, No. Invoice, Pelanggan, Sales, Item, Total, Pembayaran, Status, dan Aksi.
- Template POS tidak lagi memakai header generik `Read-only`; root preview mengikuti layout aktual `flex flex-1 overflow-hidden`.
- Template POS diperbarui menjadi layout desktop app-shell penuh dengan tab Produk/Layanan, pencarian produk berikon, chip stok dengan ikon check, grid produk, dan cart kanan `w-[340px]`.
- Target modal pembayaran POS tetap ada di DOM untuk registry panduan, tetapi dibuat transparan saat bukan langkah pembayaran agar halaman POS default tetap terlihat seperti halaman aktual.

## Verifikasi

- `pnpm --filter @pos/web test features/help-documentation/__tests__/help-visual-guide.test.tsx features/help-documentation/__tests__/HelpDiagramStepper.test.tsx`
- `pnpm --filter @pos/web test features/help-documentation/__tests__/help-visual-guide.test.tsx`
- `pnpm --filter @pos/web test features/help-documentation/__tests__/HelpDiagramStepper.test.tsx`
- `pnpm --filter @pos/web test features/help-documentation/__tests__ 'app/(main)/help/__tests__/page.test.tsx'`
- `pnpm --filter @pos/web type-check`
