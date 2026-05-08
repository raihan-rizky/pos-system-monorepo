# Dashboard Enhancement Design Document

## 1. Understanding Summary
- **What is being built:** A comprehensive dashboard update featuring a Profit & Loss (P&L) chart, Salesperson rankings, Production status overview, Customer insights, and Down Payment (DP) tracking.
- **Why it exists:** To give store owners a complete, 360-degree view of financial health, team performance, operational bottlenecks, and customer loyalty in one place.
- **Who it is for:** High-level management (`OWNER` and `ADMIN` roles).
- **Key constraints:** Requires a database update to record `unitCost` on `TransactionItem` at the time of sale. Data for past transactions will be backfilled using current product costs.
- **Explicit non-goals:** We are focusing on high-level snapshots for the dashboard, not deep-dive granular historical reporting pages.

## 2. Assumptions
- **Layout:** We will reorganize the dashboard into a clean CSS grid to prevent clutter.
- **Performance:** All new database queries will be executed in parallel on the server (`/api/dashboard`) to ensure the page continues to load instantly.
- **Security:** Data remains restricted to `OWNER` and `ADMIN` roles.

## 3. Decision Log
| Decision | Selected Option | Alternatives Considered | Rationale |
| :--- | :--- | :--- | :--- |
| **Historical P&L Data** | Backfill past transactions using the current product `costPrice`. | Leave past transaction costs as 0. | Ensures the P&L chart is immediately useful and visually complete upon launch. |
| **Dashboard Architecture** | Single API route (`/api/dashboard`) with modular frontend React components. | Micro-endpoints per widget (client-side fetching). | Avoids premature optimization (YAGNI). Keeps network requests low while keeping React code clean. |
| **Operational Metrics** | High-level rankings and status counts (Top 5 lists, Donut/Pill counts). | Deep historical trend charts for every metric. | Keeps the dashboard actionable, readable, and easy to scan at a glance. |
| **Down Payments (DP)** | Both a total outstanding metric card AND a list of specific active DP transactions. | Only a total card, or only a list. | Provides both a high-level financial pulse and actionable details for staff follow-ups. |

## 4. Final Technical Design

### A. Database Schema
- **Migration:** Add `unitCost Decimal? @db.Decimal(12, 2)` to the `TransactionItem` model in `schema.prisma`.
- **Backfill Script:** Create a utility script to map the current `Product.costPrice` into the new `unitCost` field for all historical `TransactionItem` records.

### B. API Logic (`/api/dashboard/route.ts`)
Expand the existing `Promise.all` block to concurrently fetch:
1. **Profit Data:** Include `unitCost` in the 7-day query to calculate `Profit = Revenue - Cost`.
2. **Top Salespersons:** Group current month transactions by `salespersonId`, sum the totals, return top 5.
3. **Top Customers:** Group transactions by `customerId`, sum totals, return top 5.
4. **Production Status:** Count `isJobOrder = true` transactions, grouped by `productionStatus`.
5. **Down Payments:** Sum the outstanding balance (`total - amountPaid`) for all transactions with status `DP`, and fetch the 5 most recent DP transactions.

### C. Frontend Architecture (`apps/web/app/(main)/dashboard/page.tsx`)
Refactor the monolith page into a clean grid of dedicated components stored in `components/dashboard/`:
- `<MetricCards />` (Includes Revenue, Products, Low Stock, and the new **Outstanding DP** card)
- `<RevenueProfitChart />` (Centerpiece area chart showing Revenue vs. Cost)
- `<TopSalespersonsList />` 
- `<TopCustomersList />`
- `<ProductionStatusBoard />` 
- `<ActiveDPList />` 
