# Inventory Check In / Check Out

## Understanding

- Inventory Check In / Check Out is a per-store, per-day workflow for stationary and printing operations.
- Before check-in is completed, the `Tugas` tab is blocked with a check-in prompt.
- Morning Check includes stock-risk review, counted key production materials, and Workspace & Safety checks.
- Key production materials use a hybrid model: auto-suggest from printing raw-material usage, with owner/admin pinning as a later extension.
- Check-out requires daily work completion. Weekly proof is optional except on Saturday in Asia/Jakarta business time.
- Check-out records a day/shift summary and `Riwayat Tugas Harian` shows daily session history with internal **Check In** and **Check Out** tabs.
- **Riwayat Check-Out** uses expandable rows to summarize what happened that day from the stored checkout snapshot.

## Assumptions

- Other inventory tabs remain accessible before check-in.
- The first implementation ships with default Workspace & Safety items and product suggestions from existing data.
- The session snapshot is sufficient for audit/history even if product stock changes later.
- Check-out history should read stored `checkOutSnapshot` data instead of recomputing old days from current task/stock state.
- Owner/admin customization of safety items and pinned materials can be added later without changing the store-day session model.

## Decision Log

- Store/day session model was chosen over per-user sessions because the user wants one operational inventory day per store.
- `Tugas` is the only blocked area to avoid stopping urgent stock or approval work.
- Morning Check stores counted material entries and acknowledgement snapshots instead of mutating stock automatically.
- Saturday weekly proof is treated as required for check-out; other days keep it visible but optional.
- The UI includes an animated progress bar during Morning Check.
- Check-out history stays inside `Riwayat Tugas Harian` as an internal tab beside Check In history to avoid adding another top-level inventory tab.
