# Daily Inventory Command Center

## Understanding

- The `/inventory` page should help inventory staff start from today's operational work, not from raw history.
- The default summary screen groups stock risk, daily tasks, approvals, corrections, and transaction entry points.
- Surat Jalan verification is part of the inventory workflow because approval finalizes stock-out impact.
- Existing approval rules and RBAC stay unchanged.
- The implementation reuses the inventory summary query and existing Surat Jalan approval endpoint.

## Assumptions

- Inventory operators work store-by-store with hundreds to low thousands of products.
- The default screen should avoid extra client fetches before first render.
- Pending workflow items are not final stock movements until their existing approval endpoints complete.

## Decision Log

- Use the existing `InventoryWorkspace` summary screen instead of adding a separate page.
- Add pending Surat Jalan count to the inventory summary so the command center can show it server-side.
- Route command-center Surat Jalan actions to the existing Transaksi > Surat Jalan tab.
- Add a compact verification queue above the full Surat Jalan history list.
