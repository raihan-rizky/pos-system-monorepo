# Redesign Inventory Dashboard & Action Consolidations

This document logs the design process, decisions, and finalized architecture for the inventory workspace layout redesign.

## Understanding Summary

*   **Goal:** Redesign `/inventory` page to turn the cluttered inputs list on the "Ringkasan" (Summary) tab into a modern, rich analytics dashboard.
*   **Action Consolidations:** Move all form inputs (Daily Stock Matching, Weekly Cleaning Proof, Damaged Product Report, Inbound Receipt Draft) into a single dropdown button ("Input / Transaksi") and present them in focused modals.
*   **Users:** Store owners, administrators, and inventory staff.
*   **Key constraints:** Maintain responsiveness, preserve existing API contracts, use lucide/SVG icons instead of emojis, and apply strict contrast/focus requirements.

## Assumptions

1.  Renaming the `"Ringkasan"` tab to `"Dashboard"` makes the landing experience feel analytical rather than operational checklist-only.
2.  Components are modularized to keep `InventoryWorkspace.tsx` maintainable and lightweight.
3.  Modals import the shared `Modal` component from `@pos/ui` for focus management, overlay styling, and escape-key handling.

## Decision Log

| Decision | Alternatives Considered | Reason for Selection |
| :--- | :--- | :--- |
| **Approach 1: Dropdown + Centered Modals** | Approach 2 (Split Button + Right Drawer), Approach 3 (FAB Speed-dial) | Centered modals provide the best layout compatibility across both desktop and mobile viewports. It keeps simple forms focused and handles complex tables in larger overlays without layout jumping. |
| **Dashboard Tab Refinement** | Keep static layout or use separate tabs for inputs | Moving forms off the main dashboard screen allows the page to function as a true, clean analytics overview, leaving forms to be opened on-demand. |
| **No emoji icons** | Emojis in labels | Emphasizes UI/UX professionalism. Every action and status indicator will use clean SVG vectors matching the rest of the application. |
| **Modal dirty check** | Silent closing | Prevents accidental closing of the complex Inbound Receipt form, protecting input progress. |

## Final Architecture

### Main View
*   **Header**: Left contains titles, right contains a premium primary dropdown button **"Input / Transaksi"** with an SVG plus and chevron icon.
*   **Dashboard View**:
    *   **Metric Grid**: 3 cards for Pending requests, Unverified logs, and Inbound receipts awaiting approval.
    *   **Layout Grid**:
        *   **Checklist Status Panel**: A beautiful panel showing daily and weekly task completion status with colored indicators.
        *   **Activities Panel**: Informational text or a list of recent stock adjustments.
        *   **Information Panels**: Muted panels for quick internal use, verified stock logs, inventory valuation, Surat Jalan history, and bulk stock.

### Modals
*   `DailyMatchingModal`: Fields for date matching note.
*   `WeeklyProofModal`: Fields for week selection (displaying the current week), `prnt.sc` URL, and a note.
*   `DamagedReportModal`: Fields for Product ID, quantity, `prnt.sc` proof URL, and a note.
*   `InboundReceiptModal`: Submits inbound details (Supplier ID, Shopping Request ID, Product ID, Expected Quantity, Received Quantity, Status, Notes) in a wide dialog size.
