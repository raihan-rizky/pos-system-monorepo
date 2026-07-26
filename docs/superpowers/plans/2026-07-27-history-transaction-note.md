# Catatan Transaksi di Halaman Riwayat — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tampilkan `Transaction.note` di halaman Riwayat (di bawah nama pelanggan pada tabel desktop, sebagai baris yang bisa diklik pada kartu mobile) dan izinkan mengubahnya lewat modal Ubah Transaksi.

**Architecture:** `Transaction.note` sudah ada di skema Prisma dan sudah ikut terkirim dari `GET /api/transactions` (route memakai `include`, jadi seluruh field skalar terbawa) — tidak ada perubahan skema atau migrasi. Pekerjaan terbagi tiga: (1) `PATCH /api/transactions/[id]` dibuat menerima `note`, (2) satu komponen modal baca-saja baru untuk menampilkan catatan penuh di mobile, (3) perubahan JSX di `page.tsx` untuk merender catatan dan menambah field edit.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma (`@pos/db`), Zod, TanStack Query, Tailwind, Vitest 4.

## Global Constraints

- Semua teks yang dilihat pengguna berbahasa Indonesia.
- Lingkungan test Vitest adalah `node`, **bukan** jsdom. Test komponen memakai `renderToStaticMarkup` dari `react-dom/server` dan hanya boleh memeriksa markup statis — tidak ada simulasi klik, tidak ada `@testing-library`.
- `page.tsx` tidak boleh mengekspor apa pun kecuali `default`. Ini dijaga oleh test `app/(main)/history/__tests__/page-exports.test.ts`. Komponen yang perlu diuji harus tinggal di `app/(main)/history/components/`.
- Perintah menjalankan test satu berkas (dari root repo): `pnpm --filter @pos/web exec vitest run '<path>'`. Path yang mengandung `[id]` harus dikutip dengan kutip tunggal — membungkusnya lewat `pnpm ... test` merusak tanda kurung siku.
- Perintah type-check: `pnpm --filter @pos/web type-check`.
- `Transaction.note` bertipe `string | null`. String kosong selalu disimpan sebagai `null`, mengikuti pola `customerName` yang sudah ada.
- Tidak ada perubahan skema Prisma dan tidak ada migrasi dalam rencana ini.

## File Structure

| Berkas | Tanggung jawab | Aksi |
|---|---|---|
| `apps/web/app/api/transactions/[id]/route.ts` | Menerima dan menyimpan `note` pada PATCH | Modify |
| `apps/web/app/api/transactions/[id]/__tests__/route.test.ts` | Test PATCH menyimpan `note` | Modify |
| `apps/web/hooks/useTransactions.ts` | Tipe input mutasi update transaksi | Modify |
| `apps/web/app/(main)/history/components/TransactionNoteModal.tsx` | Modal baca-saja berisi catatan penuh | Create |
| `apps/web/app/(main)/history/__tests__/TransactionNoteModal.test.tsx` | Test modal catatan | Create |
| `apps/web/app/(main)/history/page.tsx` | Render catatan di tabel desktop & kartu mobile, state modal, field edit | Modify |

---

### Task 1: PATCH menerima dan menyimpan `note`

**Files:**
- Modify: `apps/web/app/api/transactions/[id]/route.ts` (skema baris 27–33, destrukturisasi baris 154, blok `updateData` baris 209–222)
- Modify: `apps/web/hooks/useTransactions.ts` (`UpdateTransactionInput`, baris 297–304)
- Test: `apps/web/app/api/transactions/[id]/__tests__/route.test.ts`

**Interfaces:**
- Consumes: tidak ada (task pertama).
- Produces: `PATCH /api/transactions/:id` menerima body field `note?: string | null`; `UpdateTransactionInput` di `@/hooks/useTransactions` punya properti opsional `note?: string | null`. Task 5 memakai keduanya.

- [ ] **Step 1: Tulis test yang gagal**

Buka `apps/web/app/api/transactions/[id]/__tests__/route.test.ts`. Di dalam blok `describe("PATCH /api/transactions/[id]", ...)` yang sudah ada, tambahkan test berikut setelah test `"syncs the single payment badge method when paymentMethod changes"` (sebelum `});` penutup describe di baris 182):

```ts
  it("saves the transaction note and stores an empty note as null", async () => {
    transactionFindFirstMock.mockResolvedValue({
      id: "tx-1",
      status: "COMPLETED",
      payments: [],
    });
    transactionUpdateMock.mockResolvedValue({
      id: "tx-1",
      note: "Ambil sore, hubungi dulu",
      status: "COMPLETED",
      items: [],
      cashier: { name: "Owner One" },
    });

    const saved = await PATCH(
      new Request("http://localhost/api/transactions/tx-1", {
        method: "PATCH",
        body: JSON.stringify({ note: "Ambil sore, hubungi dulu" }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(saved.status).toBe(200);
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tx-1" },
        data: expect.objectContaining({ note: "Ambil sore, hubungi dulu" }),
      }),
    );

    transactionUpdateMock.mockClear();

    const cleared = await PATCH(
      new Request("http://localhost/api/transactions/tx-1", {
        method: "PATCH",
        body: JSON.stringify({ note: "" }),
      }),
      { params: Promise.resolve({ id: "tx-1" }) },
    );

    expect(cleared.status).toBe(200);
    expect(transactionUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ note: null }),
      }),
    );
  });
```

Kenapa dua asersi dalam satu test: keduanya menguji satu aturan yang sama (bagaimana `note` dipetakan ke `updateData`), termasuk cabang string-kosong-jadi-`null` yang gampang terlewat.

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
pnpm --filter @pos/web exec vitest run 'app/api/transactions/[id]/__tests__/route.test.ts'
```

Diharapkan: GAGAL. Karena `note` belum ada di skema Zod, `parsed.data.note` tidak ada, `updateData` jadi kosong, dan route mengembalikan 422 `"Tidak ada field yang diubah"` — jadi `expect(saved.status).toBe(200)` gagal.

- [ ] **Step 3: Tambahkan `note` ke skema Zod**

Di `apps/web/app/api/transactions/[id]/route.ts`, ubah `updateTransactionSchema` (baris 27–33) menjadi:

```ts
const updateTransactionSchema = z.object({
  salesName: z.string().optional().nullable(),
  salespersonId: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  note: z.string().optional().nullable(),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]).optional(),
  status: z.enum(["COMPLETED", "DP", "VOIDED", "REFUNDED", "PENDING_APPROVAL"]).optional(),
});
```

- [ ] **Step 4: Destrukturisasi `note` dan tulis ke `updateData`**

Di berkas yang sama, ubah baris 154 dari:

```ts
    const { salesName, salespersonId, customerName, paymentMethod, status } = parsed.data;
```

menjadi:

```ts
    const { salesName, salespersonId, customerName, note, paymentMethod, status } = parsed.data;
```

Lalu di blok `updateData` (baris 209 dan setelahnya), sisipkan satu baris tepat setelah baris `customerName`:

```ts
    if (customerName !== undefined) updateData.customerName = customerName || null;
    if (note !== undefined) updateData.note = note || null;
```

Jangan sentuh baris `paymentMethod`, `payments`, atau `status` di bawahnya.

- [ ] **Step 5: Jalankan test, pastikan lulus**

```bash
pnpm --filter @pos/web exec vitest run 'app/api/transactions/[id]/__tests__/route.test.ts'
```

Diharapkan: LULUS, 3 test (2 lama + 1 baru).

- [ ] **Step 6: Tambahkan `note` ke tipe input hook**

Di `apps/web/hooks/useTransactions.ts`, ubah `UpdateTransactionInput` (baris 297–304) menjadi:

```ts
export interface UpdateTransactionInput {
  id: string;
  salesName?: string;
  salespersonId?: string;
  customerName?: string;
  note?: string | null;
  paymentMethod?: string;
  status?: string;
}
```

Fungsi `updateTransaction` tidak perlu diubah — ia sudah meneruskan seluruh body apa adanya.

- [ ] **Step 7: Type-check**

```bash
pnpm --filter @pos/web type-check
```

Diharapkan: selesai tanpa error.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/app/api/transactions/[id]/route.ts" "apps/web/app/api/transactions/[id]/__tests__/route.test.ts" apps/web/hooks/useTransactions.ts
git commit -m "feat: allow updating transaction note via PATCH"
```

---

### Task 2: Komponen `TransactionNoteModal`

**Files:**
- Create: `apps/web/app/(main)/history/components/TransactionNoteModal.tsx`
- Test: `apps/web/app/(main)/history/__tests__/TransactionNoteModal.test.tsx`

**Interfaces:**
- Consumes: tidak ada.
- Produces: named export `TransactionNoteModal` dengan props `{ note: string; documentNumber?: string | null; onClose: () => void }`. Task 3 merender komponen ini.

Catatan desain: proyek ini tidak punya komponen Modal bersama — setiap modal menulis backdrop dan panelnya sendiri. Markup di bawah mengikuti `EditModal` di `page.tsx` (baris 260–283) supaya tampilannya seragam.

- [ ] **Step 1: Tulis test yang gagal**

Buat `apps/web/app/(main)/history/__tests__/TransactionNoteModal.test.tsx`:

```tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { TransactionNoteModal } from "../components/TransactionNoteModal";

describe("TransactionNoteModal", () => {
  it("renders the full note text across line breaks plus the document number", () => {
    const html = renderToStaticMarkup(
      <TransactionNoteModal
        note={"Baris pertama\nBaris kedua yang panjang sekali dan tidak boleh terpotong"}
        documentNumber="INV-20260727-0001"
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain("Catatan");
    expect(html).toContain("INV-20260727-0001");
    expect(html).toContain("Baris pertama");
    expect(html).toContain("Baris kedua yang panjang sekali dan tidak boleh terpotong");
    expect(html).toContain("whitespace-pre-wrap");
  });

  it("omits the subtitle when the transaction has no document number", () => {
    const html = renderToStaticMarkup(
      <TransactionNoteModal
        note="Transaksi tanpa nomor"
        documentNumber={null}
        onClose={vi.fn()}
      />,
    );

    expect(html).toContain("Transaksi tanpa nomor");
    expect(html).not.toContain("data-testid=\"note-modal-subtitle\"");
  });
});
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

```bash
pnpm --filter @pos/web exec vitest run 'app/(main)/history/__tests__/TransactionNoteModal.test.tsx'
```

Diharapkan: GAGAL saat resolusi impor — `Failed to resolve import "../components/TransactionNoteModal"`.

- [ ] **Step 3: Tulis komponennya**

Buat `apps/web/app/(main)/history/components/TransactionNoteModal.tsx`:

```tsx
"use client";

import { X } from "lucide-react";

export function TransactionNoteModal({
  note,
  documentNumber,
  onClose,
}: {
  note: string;
  documentNumber?: string | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative flex flex-col w-full max-w-sm max-h-[90vh] bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="shrink-0 px-6 pt-6 pb-4 border-b border-surface-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-surface-900">Catatan</h2>
            {documentNumber && (
              <p data-testid="note-modal-subtitle" className="text-xs text-surface-500 mt-0.5">
                {documentNumber}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="p-2 rounded-xl hover:bg-surface-100 transition-colors text-surface-400 hover:text-surface-700"
          >
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 overflow-y-auto min-h-0">
          <p className="text-sm leading-relaxed text-surface-700 whitespace-pre-wrap break-words">
            {note}
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

```bash
pnpm --filter @pos/web exec vitest run 'app/(main)/history/__tests__/TransactionNoteModal.test.tsx'
```

Diharapkan: LULUS, 2 test.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(main)/history/components/TransactionNoteModal.tsx" "apps/web/app/(main)/history/__tests__/TransactionNoteModal.test.tsx"
git commit -m "feat: add read-only transaction note modal"
```

---

### Task 3: Baris Catatan di kartu mobile + pasang modal

**Files:**
- Modify: `apps/web/app/(main)/history/page.tsx` (impor dinamis sekitar baris 92, state sekitar baris 989, kartu mobile sekitar baris 1642–1647, render modal sekitar baris 1825)

**Interfaces:**
- Consumes: `TransactionNoteModal` dari Task 2, props `{ note: string; documentNumber?: string | null; onClose: () => void }`.
- Produces: tidak ada (perubahan internal halaman).

Tidak ada test otomatis untuk task ini: `page.tsx` tidak boleh mengekspor komponennya (dijaga `page-exports.test.ts`) dan lingkungan Vitest bukan jsdom, jadi klik tidak bisa disimulasikan. Verifikasi lewat type-check plus pemeriksaan manual di browser pada Step 5.

- [ ] **Step 1: Tambahkan impor dinamis**

Di `apps/web/app/(main)/history/page.tsx`, tepat setelah blok `ApproveDraftDialog` (berakhir di baris 99) dan sebelum `function formatJakartaDateInput`, sisipkan:

```tsx
const TransactionNoteModal = dynamic(
  () =>
    import("./components/TransactionNoteModal").then(
      (module) => module.TransactionNoteModal,
    ),
  { ssr: false },
);
```

- [ ] **Step 2: Tambahkan state**

Tepat setelah baris `const [selectedImageUrl, setSelectedImageUrl] = useState<string | null>(null);` (baris 989), sisipkan:

```tsx
  const [noteTransaction, setNoteTransaction] = useState<Transaction | null>(null);
```

- [ ] **Step 3: Sisipkan baris Catatan di kartu mobile**

Cari blok baris "Sales" di kartu mobile (sekitar baris 1642–1647):

```tsx
                          <div className="flex justify-between text-sm">
                            <span className="text-surface-500">Sales</span>
                            <span className={`font-medium ${isVoided ? "line-through text-surface-400" : "text-surface-900"}`}>
                              {tx.salesName || tx.salesperson?.name || <span className="text-surface-400 italic">—</span>}
                            </span>
                          </div>
```

Tepat **setelah** `</div>` penutup blok itu, sisipkan:

```tsx
                          {tx.note && (
                            <div className="flex justify-between text-sm gap-3">
                              <span className="shrink-0 text-surface-500">Catatan</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNoteTransaction(tx);
                                }}
                                className={`max-w-[60%] truncate text-right font-medium underline decoration-dotted decoration-surface-300 underline-offset-2 ${isVoided ? "line-through text-surface-400" : "text-surface-900"}`}
                              >
                                {tx.note}
                              </button>
                            </div>
                          )}
```

`stopPropagation` wajib: kartu itu sendiri sudah bisa diklik untuk membuka detail transaksi.

- [ ] **Step 4: Render modalnya**

Cari blok `{/* Approve Modal */}` (sekitar baris 1818–1825). Tepat setelah `)}` penutupnya, sisipkan:

```tsx
      {/* Note Modal */}
      {noteTransaction?.note && (
        <TransactionNoteModal
          note={noteTransaction.note}
          documentNumber={noteTransaction.invoiceNumber ?? noteTransaction.draftNumber}
          onClose={() => setNoteTransaction(null)}
        />
      )}
```

Penjagaan `noteTransaction?.note` sekaligus mempersempit tipe `string | null` jadi `string`, sesuai props komponen.

- [ ] **Step 5: Type-check dan periksa manual**

```bash
pnpm --filter @pos/web type-check
```

Diharapkan: tanpa error.

Lalu jalankan `pnpm --filter @pos/web dev`, buka `http://localhost:3002/history` dengan lebar viewport mobile (DevTools, misal 390px):

1. Transaksi yang punya catatan menampilkan baris `Catatan` di bawah baris `Sales`, satu baris, terpotong dengan elipsis bila panjang.
2. Mengklik nilai catatan membuka modal berisi teks penuh — dan **tidak** membuka detail transaksi.
3. Menutup modal (tombol X atau klik backdrop) mengembalikan ke daftar.
4. Transaksi tanpa catatan tidak menampilkan baris `Catatan` sama sekali.
5. Transaksi berstatus Void menampilkan catatan dengan coretan dan warna abu-abu.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(main)/history/page.tsx"
git commit -m "feat: show clickable transaction note row on history mobile cards"
```

---

### Task 4: Catatan di bawah nama pelanggan pada tabel desktop

**Files:**
- Modify: `apps/web/app/(main)/history/page.tsx` (sel kolom Pelanggan, baris 1421–1423)

**Interfaces:**
- Consumes: tidak ada.
- Produces: tidak ada.

Sama seperti Task 3, tidak ada test otomatis — verifikasi lewat type-check dan pemeriksaan manual.

- [ ] **Step 1: Ganti sel kolom Pelanggan**

Cari sel ini (baris 1421–1423):

```tsx
                            <td className={`py-3.5 px-4 text-sm font-medium whitespace-nowrap ${isVoided ? "text-surface-400 line-through" : "text-surface-700"}`}>
                              {tx.customerName || <span className="text-surface-400 italic">Umum</span>}
                            </td>
```

Ganti seluruhnya dengan:

```tsx
                            <td className={`py-3.5 px-4 text-sm font-medium ${isVoided ? "text-surface-400 line-through" : "text-surface-700"}`}>
                              <div className="max-w-[220px]">
                                <div className="whitespace-nowrap">
                                  {tx.customerName || <span className="text-surface-400 italic">Umum</span>}
                                </div>
                                {tx.note && (
                                  <div
                                    title={tx.note}
                                    className={`mt-0.5 whitespace-normal text-[11px] leading-snug line-clamp-2 ${isVoided ? "text-surface-400" : "text-surface-500"}`}
                                  >
                                    {tx.note}
                                  </div>
                                )}
                              </div>
                            </td>
```

Perhatikan `whitespace-nowrap` pindah dari `<td>` ke div nama saja — catatan harus boleh membungkus agar `line-clamp-2` bekerja. `line-through` tetap di `<td>` dan diwariskan ke catatan, jadi transaksi void tetap tercoret.

- [ ] **Step 2: Type-check dan periksa manual**

```bash
pnpm --filter @pos/web type-check
```

Diharapkan: tanpa error.

Dengan `pnpm --filter @pos/web dev` berjalan, buka `http://localhost:3002/history` pada lebar desktop:

1. Transaksi yang punya catatan menampilkan teks kecil abu-abu di bawah nama pelanggan.
2. Catatan panjang berhenti di dua baris; mengarahkan kursor ke atasnya memunculkan tooltip berisi teks penuh.
3. Lebar kolom Pelanggan tidak melar melebihi ~220px, dan kolom-kolom lain tidak bergeser.
4. Baris tanpa catatan setinggi sebelumnya.
5. Baris void menampilkan catatan dengan coretan dan warna abu-abu.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(main)/history/page.tsx"
git commit -m "feat: show transaction note under customer name in history table"
```

---

### Task 5: Field Catatan di modal Ubah Transaksi

**Files:**
- Modify: `apps/web/app/(main)/history/page.tsx` (`EditForm` baris 133–139, state awal baris 187–193, payload baris 240–251, JSX sekitar baris 324)

**Interfaces:**
- Consumes: `UpdateTransactionInput.note` dari Task 1.
- Produces: tidak ada.

- [ ] **Step 1: Tambahkan `note` ke tipe `EditForm`**

Ubah `EditForm` (baris 133–139) menjadi:

```tsx
type EditForm = {
  salesName: string;
  salespersonId: string;
  customerName: string;
  note: string;
  paymentMethod: string;
  status: string;
};
```

`handleChange` (baris 222) bertipe `(field: keyof EditForm, value: string)`, jadi otomatis menerima `"note"` tanpa perubahan.

- [ ] **Step 2: Isi nilai awalnya**

Ubah `useState<EditForm>` (baris 187–193) menjadi:

```tsx
  const [form, setForm] = useState<EditForm>({
    salesName: tx.salesName ?? "",
    salespersonId: tx.salespersonId ?? "",
    customerName: tx.customerName ?? "",
    note: tx.note ?? "",
    paymentMethod: tx.paymentMethod ?? "CASH",
    status: tx.status ?? "COMPLETED",
  });
```

- [ ] **Step 3: Kirim `note` di payload simpan**

Di `handleSave`, ubah blok payload (baris 240–246) menjadi:

```tsx
      const payload: Parameters<typeof updateTx.mutateAsync>[0] = {
        id: tx.id,
        salesName: form.salesName,
        salespersonId: form.salespersonId,
        customerName: form.customerName,
        note: form.note,
        paymentMethod: form.paymentMethod,
      };
```

`note` selalu ikut (tidak seperti `status` yang hanya dikirim bila berubah) supaya menghapus catatan sampai kosong tetap tersimpan — route mengubahnya jadi `null`.

- [ ] **Step 4: Tambahkan textarea-nya**

Cari blok `{/* Customer Name */}` (baris 311–324), yang berakhir dengan `</div>` setelah input nama pelanggan. Tepat setelah `</div>` itu, sisipkan:

```tsx
          {/* Note */}
          <div>
            <label className="block text-xs font-semibold text-surface-600 mb-1.5">
              Catatan
            </label>
            <textarea
              value={form.note}
              onChange={(e) => handleChange("note", e.target.value)}
              rows={3}
              placeholder="Catatan transaksi (opsional)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-sm resize-none
                focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
            />
          </div>
```

- [ ] **Step 5: Type-check dan periksa manual**

```bash
pnpm --filter @pos/web type-check
```

Diharapkan: tanpa error.

Dengan `pnpm --filter @pos/web dev` berjalan, di `http://localhost:3002/history`:

1. Buka menu aksi sebuah transaksi → Ubah. Field "Catatan" muncul di bawah "Nama Pelanggan", terisi catatan yang ada (atau kosong).
2. Ketik catatan baru, simpan, modal tertutup. Catatan baru langsung tampil di bawah nama pelanggan pada tabel.
3. Buka lagi, kosongkan catatan, simpan. Catatan hilang dari tabel — bukan berubah jadi string kosong yang menyisakan ruang.
4. Ubah hanya catatan (tanpa menyentuh field lain) tetap tersimpan, tidak muncul error "Tidak ada field yang diubah".

- [ ] **Step 6: Jalankan seluruh test yang tersentuh**

```bash
pnpm --filter @pos/web exec vitest run 'app/(main)/history/__tests__' 'app/api/transactions/[id]/__tests__/route.test.ts'
```

Diharapkan: semua LULUS, termasuk `page-exports.test.ts` yang memastikan `page.tsx` tetap tidak mengekspor apa pun selain `default`.

- [ ] **Step 7: Commit**

```bash
git add "apps/web/app/(main)/history/page.tsx"
git commit -m "feat: edit transaction note from history edit modal"
```

---

## Penyimpangan dari spec

Spec menyebut test "tombol tutup memanggil `onClose`" untuk `TransactionNoteModal`. Itu tidak bisa dikerjakan: lingkungan Vitest proyek ini adalah `node` dan test komponen memakai `renderToStaticMarkup`, sehingga tidak ada DOM untuk diklik. Sebagai gantinya Task 2 menguji apa yang bisa diverifikasi dari markup statis — teks catatan penuh dirender, `whitespace-pre-wrap` terpasang, dan subjudul hilang saat nomor dokumen tidak ada. Perilaku tombol tutup diverifikasi manual di Task 3 Step 5.
