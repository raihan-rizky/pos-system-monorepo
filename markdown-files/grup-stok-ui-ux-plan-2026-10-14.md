# Grup Stok UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Membuat seluruh alur grup stok mudah dipahami staf baru sesuai spesifikasi `grup-stok-ui-ux-design-2026-10-13.md`.

**Architecture:** Pertahankan API dan aturan transaksi stok. Pembuatan grup menggunakan tiga tahap dalam drawer yang tersedia; workspace memakai panel yang berfokus pada tugas dan riwayat berbasis endpoint yang tersedia. Helper murni menangani preview dengan resolver stok yang sudah ada, bukan rumus bisnis baru.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind, TanStack Query, Vitest, Playwright yang sudah tersedia.

## Global Constraints

- Bahasa pengguna: Indonesia yang ramah; technical terms hanya bila memang diperlukan.
- Tidak mengubah database, izin server, persetujuan stok, atau rumus bisnis.
- Tidak menambah dependency dan tidak menjalankan `pnpm build`.
- Pengguna mengelola lifecycle dev server. Gunakan server yang tersedia untuk browser QA.
- TDD: tests ditulis dan terbukti gagal sebelum implementation; lint dan type-check setelah perubahan.
- GitNexus impact upstream sebelum edit symbol; laporkan callers/process/risk, peringatkan HIGH/CRITICAL; detect changes sebelum commit.
- Headroom stats awal/akhir, compression sebelum menalar output besar; output bounded bila layanan tidak tersedia.
- ENERGY 1 / RHYTHM 2 / MOTION 1; mengikuti palet, typography, dan radius aplikasi.
- Target tombol minimal 44px; label, fokus, keyboard, error state dan loading/empty/error/retry berfungsi.
- Dokumentasi di `markdown-files`, format `{filename}-{date}.md`, sesuai pilihan pengguna.
- Reviewer menerima diff file dan hasil tes; implementer tidak membuat subagent sendiri.

## Task 1: Guided group creation and joining

**Files:**
- Modify: `apps/web/features/product-stock-groups/components/BulkStockGroupDrawer.tsx`.
- Create: `apps/web/features/product-stock-groups/group-creation-preview.ts` (pure preview/validation only).
- Test: `apps/web/features/product-stock-groups/__tests__/bulk-stock-group-drawer.test.tsx` and `group-creation-preview.test.ts`.
- Browser interaction test: `apps/web/e2e/stock-group-friendly-ux.spec.ts` or existing equivalent directory after inspecting Playwright config.

**Interfaces:** Keep `BulkStockGroupProduct`, `open`, `products`, `onClose`, `onSaved` compatible. Pure helper consumes selected products, optional target detail, source ID and conversion draft, producing preview rows and validation errors. Use `resolveConfirmedGroupStock` and its server contract to compute results. Existing group detail includes old members; include conversion links needed to connect old and incoming members.

- [ ] Inspect affected symbols using Serena; refresh stale GitNexus index and obtain impact for drawer and any existing helper changed.
- [ ] Write tests asserting the first stage asks for a new or existing group, subsequent stages preserve inputs, and the final stage shows source stock and before/after for all affected units. Pure resolver-backed cases cover non-summed stocks, duplicate units including target members, empty/zero/nonfinite quantity, and source change.

```tsx
const html = renderToStaticMarkup(<BulkStockGroupDrawer open products={products} onClose={() => {}} onSaved={() => {}} />);
expect(html).toContain("Tujuan grup");
expect(html).toContain("Buat grup baru");
expect(html).not.toContain("Pair Konversi");
```

- [ ] Run `pnpm --filter @pos/web test features/product-stock-groups/__tests__/bulk-stock-group-drawer.test.tsx features/product-stock-groups/__tests__/group-creation-preview.test.ts`; verify meaningful RED.
- [ ] Implement staged form with native validation/focus, source rebase of conversion quantities, destination loading/error/retry/empty, genuine final preview, source grouping notice, no duplicate submit, preserved draft on failure, and explicit final action.

```tsx
<ol aria-label="Tahapan grup stok">{["Tujuan grup", "Satuan dan stok", "Tinjau dan simpan"].map((label, index) => <li key={label} aria-current={step === index ? "step" : undefined}>{label}</li>)}</ol>
```

- [ ] Native dialog or existing accessible modal primitives manage focus, Escape/restore, and dirty-close choice. Display small-screen layout without horizontal overflow; keep footer reachable and form errors linked to fields. Date/count/stock data comes from real response/input.
- [ ] Run targeted tests until GREEN, `pnpm --filter @pos/web type-check`, and ESLint on changed files. Commit only task files after GitNexus detect changes and self-review. Report RED/GREEN evidence, commit and remaining limitations.
- [ ] Controller packages diff and dispatches task reviewer for spec and quality before Task 2.

## Task 2: Friendly workspace, reliable drafts, and actual history

**Files:**
- Modify: `apps/web/features/product-stock-groups/components/StockGroupWorkspace.tsx`, `api/stock-group-api.ts`, `hooks/useStockGroup.ts`, `components/StockGroupActivityTab.tsx`.
- Create: focused panel/helper/history files under `features/product-stock-groups` only when needed to keep workspace readable.
- Test: `components/__tests__/StockGroupWorkspace.test.tsx`, `StockGroupActivityTab.test.tsx`, new helper/history tests, and Task 1 browser test.

**Interfaces:** Preserve workspace caller props, `StockGroupSaveReason`, and existing mutation payloads. History consumes groupId/filter/page and `/history?tab=activity|conversion&page=N&limit=20`; query keys include all three. Stock-unit selection preserves physical quantity, and preview reuses pure resolver functions already available. Draft snapshots are independent for stock, conversion, prices by product, and addition.

- [ ] Run impact for each existing function/component/hook before editing; review source route conversion semantics so preview exactly matches server for base changes and indirect pairs.
- [ ] Write RED tests for summary explaining same physical stock, friendly tab labels, unknown HPP, positive conversion validation, correct before/after, and addition as read-only stock from group.

```tsx
expect(summary).toContain("persediaan yang sama");
expect(summary).toContain("Tetapkan stok akhir");
expect(pricingWithoutCost).toContain("HPP belum diisi");
expect(addition).toContain("Stok dari grup");
```

- [ ] Write RED request tests for actual history endpoint, filter/pagination, error/retry, and ignoring old responses. Write interaction coverage for close/Escape/dirty confirmation, tab arrow/Home/End keys, stock unit switch, and save one price preserving other drafts.

```ts
expect(requestedUrl).toBe("/api/product-stock-groups/group-1/history?tab=conversion&page=2&limit=20");
```

- [ ] Run targeted feature tests and verify failures are missing desired behavior, then implement readable Ringkasan/Satuan/Harga/Tambah satuan/Riwayat, task-specific stock editor with same physical quantity conversion, advanced multiplier disclosure, live results, and inline statuses.
- [ ] Validate empty numeric values without coercing them to zero. HPP blank produces an unknown margin, not full profit. Negative margin has explanation. Addition computes `stock = baseStock / newMultiplier` and sends this required field without increasing base stock.
- [ ] Preserve drafts on tab changes and failures. Save success resets only its draft snapshot, updates cache, and refreshes history. Conflict reload requires an explicit draft decision. Prevent repeat submits and unchanged saves.
- [ ] Replace history placeholder with records, actual fields only, localized labels and dates, pagination/filter plus loading/empty/error/retry. Align global activities wording.
- [ ] Maintain focus/accessibility/mobile constraints; reuse dialog solution from Task 1 only if there is genuine shared behavior.
- [ ] Run feature tests to GREEN, type-check, and ESLint; detect changes, commit task files, report evidence. Controller reviews the task diff before Task 3.

## Task 3: Entry actions, inventory explanation, help and verification

**Files:**
- Modify: `apps/web/app/(main)/products/ProductsClientPage.tsx` (group action labels only), `apps/web/features/inventory-management/components/StockGroupBulkPanel.tsx` (explanation only), `apps/web/features/help-documentation/components/HelpContent.tsx`, `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`.
- Update: `markdown-files/grup-stok-ui-ux-design-2026-10-13.md`, create `grup-stok-ui-ux-implementation-2026-10-14.md`.
- Test: inventory/help/workflow tests relevant to changed procedures, Task 1 browser test.

**Interfaces:** Keep product selection, routes, existing inventory preview/submit approval contracts, and workflow IDs intact. Pass optional canUpdateProducts and canCreateProducts flags from page to workspace (defaultfalse). Stock update inventory.update, conversion/pricing product.update, addition product.create. Creation/join requires product.update AND inventory.update. Send source group identity in selected product props for accurate move notices. Use actual labels produced by Tasks1/2 in help/catalog steps.

- [ ] Run impact for entry and documentation symbols before editing; broad product page has more callers, restrict edits to group controls.
- [ ] Write RED workflow/markup assertion that distinguishes direct set-final-stock from approval-based inventory requests and references the new three-stage creation flow.

```ts
expect(stockGroupWorkflow.steps.map(step => step.description).join(" ")).toContain("Tinjau dan simpan");
expect(inventoryHtml).toContain("persetujuan");
```

- [ ] Run tests to verify RED, then align entry action "Buat atau gabungkan grup stok", existing unit labels, and stock mode explanation. Help/catalog document each task, real history, and shared physical stock without contradicting approval semantics.
- [ ] Fix reviewed tiny conversion display: 1dus=100000pcs with sourcedus must preview1pcs=0.00001dus, never0dus. Add browser RED regression, adjust Intl formatter adaptively, preserve ordinary formatting/resolver/payload; impact formatter before edit.
- [ ] Run all product-stock-groups tests, affected inventory/UI/workflow tests, directpackage lint/type-check and ESLint for changed files. Never rootTurbo lint/type-check because^build triggers productionbuild. Record pre-existing failures separately after proving unchanged baseline.
- [ ] Browser QA against an already running dev server exercises new/existing group paths with intercepted fixture requests (no real database mutations), invalid values, draft close, retry, tab keyboard, mobile 375px and desktop 1280px, and screenshot/console review. If server is unavailable, do not invent PASS; report exact blocked browser check.
- [ ] Write implementation documentation with tests, review outcome, screenshots if available, and verified limitations. Detect changes and commit intended task files only.
- [ ] Controller performs broad branch review with diff, evidence, and ledger. Fix important findings with covering tests and one scoped re-review. Finish with concrete change/test/risk report.

## Plan self-review

## Status pelaksanaan 15 Oktober 2026

- Perbaikan review akhir selesai: retry kegagalan detail awal mereset boundary TanStack dan React; tautan pengajuan ke `/inventory` memakai izin update serta akses halaman dan konfirmasi draft sebelum keluar. RED browser mencakup GET yang menghabiskan retry lalu dipulihkan dan tautan yang belum tersedia. GREEN: fixture workspace lengkap, tujuh regresi konversi lama, 72 tes fitur, direct web tsc, dan ESLint (nol error, lima peringatan console fixture). Scoped re-review perbaikan `c716ce2` disetujui: kedua temuan ditangani, tanpa Critical/Important baru. Suite final `pnpm test` lulus dengan exit 0: 457 berkas lulus, 2 dilewati; 2.580 tes lulus, 10 dilewati (1.239,41 detik).
- Task 1 selesai pada `c9eb015` dan review disetujui.
- Task 2 selesai pada `c9b158e`, diperbaiki melalui `5963f83` dan `bfef143`; review menyatakan temuan penting telah ditangani. 72 tes fitur serta fixture browser workspace lulus sebelum Task 3.
- Task 3 implementasi selesai: izin entry, penjelasan Inventori, Bantuan tiga role, katalog workflow, dan regresi formatter konversi kecil. RED tercatat sebelum implementasi. Browser pembuatan/penggabungan, 93 tes terarah di luar HelpContent dan 23 tes HelpContent terbaru, type-check, dan ESLint lulus; katalog terbaru diuji ulang 18/18 lulus. Dua tes rendering visual luas melewati timeout saat suite lain berjalan. Review akhir serta scoped re-review selesai dan disetujui; suite final lulus (2.580 tes, 10 dilewati, exit 0); lihat laporan task dan `grup-stok-ui-ux-implementation-2026-10-15.md`.
- Penyesuaian kontrak: sumber stok saat bergabung dikunci pada anggota acuan yang valid, karena endpoint mempertahankan satuan acuan tujuan. Tidak ada perubahan API, database, aturan stok, atau persetujuan. Browser QA memakai komponen asli dan fixture API dalam memori; end-to-end aplikasi toko nyata belum diverifikasi.

Each specification section maps to Task 1 (creation/join), Task 2 (workspace/history/drafts), or Task 3 (entry/inventory/help/validation). Shared files/interfaces: Task 1/2 browser tests are extended sequentially; Task 1 helper may be consumed by Task 2 if applicable; Task 3 copy follows labels established by Tasks 1/2. No database changes or feature expansion required.
