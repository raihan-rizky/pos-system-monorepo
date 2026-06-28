# Surat Jalan Marking Design

## Understanding Summary

- Inventory users need a Surat Jalan marking workflow in the inventory page.
- Marking is separate from Surat Jalan approval.
- A Surat Jalan can be approved or confirmed and still need marking.
- Marking applies to all unmarked Surat Jalan records, not only records from the current day.
- Marking is an operational inventory task and does not change stock or approval state.
- Inventory check-out should account for unmarked Surat Jalan.
- Check-out may proceed when every Surat Jalan has a marking outcome and exception outcomes include a note.

## Assumptions

- Marking means inventory staff has physically checked or handled the Surat Jalan.
- Marking must be persisted on the Surat Jalan record.
- Marking must be auditable with actor, timestamp, status, and note when required.
- Existing Surat Jalan approval behavior remains unchanged.
- Existing role checks for inventory and Surat Jalan workflows should be reused.
- Expected scale is normal store-level operations: dozens to low hundreds of Surat Jalan records.

## Decision Log

### Store marking state on Surat Jalan

- Decision: Add marking fields directly to the Surat Jalan record.
- Alternatives: Separate marking table, generated daily checklist items.
- Reason: A single operational marking state is simple to query, easy to audit, and avoids duplicating period-based checklist rows for old Surat Jalan records.

### Keep approval separate

- Decision: Approval and marking remain independent actions.
- Alternatives: Reuse approval as marking, or require approval before marking.
- Reason: The business approval controls stock impact, while marking records inventory handling.

### Require all historical unmarked Surat Jalan

- Decision: The marking queue includes every Surat Jalan in the store where marking is not cleared.
- Alternatives: Only current-day Surat Jalan.
- Reason: The user explicitly wants all unmarked Surat Jalan ever to be handled.

### Allow check-out with noted exceptions

- Decision: Check-out can proceed when every Surat Jalan is either completed or has an exception outcome with a note.
- Alternatives: Block check-out for follow-up or postponed statuses.
- Reason: Inventory users need to close the day when exceptions are documented.

## Marking Statuses

- `UNMARKED`: Default state. Blocks check-out.
- `COMPLETED`: Label `Selesai`. Surat Jalan is signed, delivered, and the stock-out quantity is correct. Clears check-out.
- `NOT_DELIVERED`: Label `Belum Dikirim`. Surat Jalan has not been delivered yet. Requires note. Clears check-out.
- `NEEDS_SIGNATURE`: Label `Perlu Tanda Tangan`. Surat Jalan has been delivered or prepared, but the required signature is missing. Requires note. Clears check-out.
- `NEEDS_FOLLOW_UP`: Surat Jalan has been checked but requires follow-up. Requires note. Clears check-out.
- `POSTPONED`: Surat Jalan cannot be completed now. Requires note. Clears check-out.
- `NOT_RELEVANT`: Surat Jalan does not need inventory handling. Requires note. Clears check-out.

## Marking Option Tooltips

- `Selesai`: Gunakan jika Surat Jalan sudah ditandatangani, barang sudah dikirim, dan stok keluar sudah sesuai.
- `Belum Dikirim`: Gunakan jika Surat Jalan sudah ada di sistem tetapi barang belum dikirim ke penerima.
- `Perlu Tanda Tangan`: Gunakan jika pengiriman atau persiapan sudah berjalan, tetapi tanda tangan penerima atau pihak terkait belum lengkap.
- `Perlu Follow Up`: Gunakan jika Surat Jalan sudah dicek, tetapi masih ada masalah yang harus ditindaklanjuti.
- `Ditunda`: Gunakan jika pemeriksaan Surat Jalan belum bisa diselesaikan sekarang dan perlu dilanjutkan nanti.
- `Tidak Relevan`: Gunakan jika Surat Jalan tidak perlu ditangani oleh inventory, misalnya data lama, salah input, atau bukan bagian dari proses gudang.

## Proposed Data Shape

- `markingStatus`: enum status.
- `markedAt`: timestamp of latest marking action.
- `markedById`: user who marked it.
- `markedByName`: user display name at marking time.
- `markingNote`: required for exception statuses.

## UI Behavior

- Rename the inventory Surat Jalan area from verification language to marking language.
- Show separate badges for approval state and marking state.
- Rows with `UNMARKED` show a `Marking` action.
- The marking action opens a modal or compact form with outcome options.
- `NOT_DELIVERED`, `NEEDS_SIGNATURE`, `NEEDS_FOLLOW_UP`, `POSTPONED`, and `NOT_RELEVANT` require a note before submit.
- Each outcome option shows a tooltip explaining when that option should be used.
- Pending approval records can still expose the existing approval action separately.

## Check-Out Rule

Inventory check-out should block only when at least one Surat Jalan is still `UNMARKED`.

Exception statuses do not block check-out if their required note is present:

- `NEEDS_FOLLOW_UP`
- `POSTPONED`
- `NOT_RELEVANT`
- `NOT_DELIVERED`
- `NEEDS_SIGNATURE`

The check-out completion task label should read:

`Semua Surat Jalan sudah dimarking atau diberi catatan pengecualian`

## Risks

- Existing historical Surat Jalan will become check-out blockers until marked.
- If many historical records exist, the initial queue may be large.
- Role boundaries need to stay clear so users do not confuse approval with marking.
- If exception notes are too loose, teams may overuse exceptions instead of completing handling.

## Implementation Handoff

Suggested implementation order:

1. Add database enum and fields to Surat Jalan.
2. Update Surat Jalan API types and global listing response.
3. Add marking endpoint with note validation.
4. Update inventory summary and day-session completion to count `UNMARKED` Surat Jalan.
5. Replace verification UI copy with marking UI and add outcome modal.
6. Add focused tests for API validation, check-out blockers, and UI copy.
