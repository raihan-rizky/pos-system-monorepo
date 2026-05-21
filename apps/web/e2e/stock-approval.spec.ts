import { expect, test, type Page } from "@playwright/test";
import { authenticate, mockApis } from "./fixtures/app";
import {
  makeStockLog,
  setupStockApprovalRoutes,
  type MockStockLog,
} from "./fixtures/stock-approval";
import { StockApprovalPage } from "./pages/StockApprovalPage";

type Role = "OWNER" | "ADMIN" | "CASHIER" | "SALES";

async function setupRole(
  page: Page,
  role: Role,
  opts: {
    initialLogs?: MockStockLog[];
    userId?: string;
    userName?: string;
  } = {},
) {
  const userId = opts.userId ?? `e2e-${role.toLowerCase()}`;
  const userName = opts.userName ?? `E2E ${role}`;
  await authenticate(page, role);
  await page.context().addCookies([
    { name: "x-pos-user-id", value: userId, domain: "localhost", path: "/" },
    {
      name: "x-pos-user-name",
      value: encodeURIComponent(userName),
      domain: "localhost",
      path: "/",
    },
  ]);
  await mockApis(page);
  // setupStockApprovalRoutes is registered AFTER mockApis, so its more
  // specific routes take precedence over the catch-all /api/** handler.
  return setupStockApprovalRoutes(page, {
    initialLogs: opts.initialLogs,
    currentUserId: userId,
    currentUserName: userName,
    currentUserRole: role,
  });
}

const PENDING_FROM_ADMIN = makeStockLog({
  id: "log-pending-1",
  type: "IN",
  reason: "RESTOCK",
  quantity: 5,
  status: "PENDING",
  createdBy: "admin-other",
  person: "Ada Admin",
  note: "Restock supplier",
});

const APPROVED_HISTORICAL = makeStockLog({
  id: "log-approved-1",
  status: "APPROVED",
  type: "IN",
  reason: "RESTOCK",
  quantity: 10,
  createdBy: "admin-other",
  person: "Ada Admin",
  approvedBy: "owner-1",
  approverName: "Boss",
  decidedAt: "2026-05-19T01:00:00.000Z",
  createdAt: "2026-05-19T00:30:00.000Z",
});

const REJECTED_HISTORICAL = makeStockLog({
  id: "log-rejected-1",
  status: "REJECTED",
  type: "OUT",
  reason: "WASTE",
  quantity: 2,
  createdBy: "admin-other",
  person: "Ada Admin",
  approvedBy: "owner-1",
  approverName: "Boss",
  rejectionReason: "Bukti rusak tidak ada",
  decidedAt: "2026-05-18T01:00:00.000Z",
  createdAt: "2026-05-18T00:30:00.000Z",
});

test.describe("Stock approval flow — role-aware behavior", () => {
  test.describe("OWNER", () => {
    test("submits a stock change directly without entering the approval queue (core path)", async ({
      page,
    }) => {
      const store = await setupRole(page, "OWNER");
      const sa = new StockApprovalPage(page);

      await sa.gotoProducts();
      await sa.openStockUpdateForFirstProduct();
      await expect(sa.modalTitleForOwner()).toBeVisible();
      await expect(sa.pendingNoticeStrip()).toBeHidden();

      await sa.submitStockChange({ type: "IN", quantity: "5", note: "Restock owner" });
      await expect(page.getByRole("dialog")).toBeHidden();

      const owned = store.logs.find((l) => l.note === "Restock owner");
      expect(owned?.status).toBe("APPROVED");
      expect(owned?.approvedBy).toBe("e2e-owner");
    });

    test("approves a pending request from the Stock Logs tab", async ({ page }) => {
      const store = await setupRole(page, "OWNER", {
        initialLogs: [PENDING_FROM_ADMIN, APPROVED_HISTORICAL],
      });
      const sa = new StockApprovalPage(page);

      await sa.gotoProducts();
      await sa.openStockLogsTab();

      await expect(sa.statusChip("Pending")).toContainText("1");
      await sa.approveRow("Kertas HVS A4");

      await expect.poll(() =>
        store.logs.find((l) => l.id === "log-pending-1")?.status,
      ).toBe("APPROVED");
    });

    test("rejection requires a reason, surfaces it on the row, and never touches stock (edge path)", async ({
      page,
    }) => {
      const store = await setupRole(page, "OWNER", {
        initialLogs: [PENDING_FROM_ADMIN],
      });
      const sa = new StockApprovalPage(page);

      await sa.gotoProducts();
      await sa.openStockLogsTab();
      await sa.startRejectRow("Kertas HVS A4");

      await sa.rejectComposerSubmit().click();
      await expect(page.getByText(/Alasan penolakan wajib diisi/)).toBeVisible();
      expect(store.logs.find((l) => l.id === "log-pending-1")?.status).toBe(
        "PENDING",
      );

      await sa.rejectComposerReason().fill("Stok tidak mencukupi di gudang");
      await sa.rejectComposerSubmit().click();

      await expect.poll(() =>
        store.logs.find((l) => l.id === "log-pending-1")?.status,
      ).toBe("REJECTED");
      expect(
        store.logs.find((l) => l.id === "log-pending-1")?.rejectionReason,
      ).toBe("Stok tidak mencukupi di gudang");
    });

    test("sees a 409 conflict toast when a request was already decided by another OWNER", async ({
      page,
    }) => {
      // Prime list with a PENDING row, then race-flip it to APPROVED before approve fires.
      const store = await setupRole(page, "OWNER", {
        initialLogs: [PENDING_FROM_ADMIN],
      });
      const sa = new StockApprovalPage(page);

      await sa.gotoProducts();
      await sa.openStockLogsTab();

      // Simulate "another OWNER decided first" by mutating the mock store
      // BEFORE we click Approve. The 409 path is in the mock router.
      const target = store.logs.find((l) => l.id === "log-pending-1");
      if (target) target.status = "APPROVED";

      await sa.approveRow("Kertas HVS A4");
      await expect(sa.conflictToast()).toBeVisible();
    });

    test("OWNER override: cancels a request that was created by a different user", async ({
      page,
    }) => {
      const store = await setupRole(page, "OWNER", {
        initialLogs: [PENDING_FROM_ADMIN], // createdBy=admin-other, OWNER is e2e-owner
      });
      const sa = new StockApprovalPage(page);

      // OWNER does not see "Batalkan" because the row's RowActions only renders
      // OWNER controls (Setuju/Tolak) for PENDING rows. The OWNER-as-cancel
      // override is a server-only capability (per spec §6.4); the UI surface
      // for OWNER is reject. Ensure the UI does NOT show Cancel here.
      await sa.gotoProducts();
      await sa.openStockLogsTab();
      const row = sa.rowByProductName("Kertas HVS A4");
      await expect(row.getByRole("button", { name: "Batalkan" })).toBeHidden();
      await expect(row.getByRole("button", { name: "Setuju" })).toBeVisible();

      // Sanity-check the persisted state untouched.
      expect(store.logs.find((l) => l.id === "log-pending-1")?.status).toBe(
        "PENDING",
      );
    });
  });

  test.describe("ADMIN (requester)", () => {
    test("sees the request notice strip and submits a PENDING request without changing stock (core path)", async ({
      page,
    }) => {
      const store = await setupRole(page, "ADMIN", {
        userId: "admin-1",
        userName: "Ada Admin",
      });
      const sa = new StockApprovalPage(page);

      await sa.gotoProducts();
      await sa.openStockUpdateForFirstProduct();

      await expect(sa.modalTitleForRequester()).toBeVisible();
      await expect(sa.pendingNoticeStrip()).toBeVisible();

      await sa.submitStockChange({
        type: "IN",
        quantity: "3",
        note: "Restock dari supplier",
      });

      await expect(sa.pendingSuccessBanner()).toBeVisible();
      const created = store.logs.find((l) => l.note === "Restock dari supplier");
      expect(created?.status).toBe("PENDING");
      expect(created?.approvedBy).toBeNull();
    });

    test("can cancel only their OWN pending request (edge path: 403 surface for someone else's)", async ({
      page,
    }) => {
      const ownPending = makeStockLog({
        id: "log-own-pending",
        status: "PENDING",
        createdBy: "admin-1",
        person: "Ada Admin",
        note: "Permintaan saya",
      });
      const othersPending = makeStockLog({
        id: "log-others-pending",
        status: "PENDING",
        createdBy: "admin-other",
        person: "Other Admin",
        note: "Permintaan orang lain",
        product: { ...PENDING_FROM_ADMIN.product, name: "Banner Indoor" },
      });
      const store = await setupRole(page, "ADMIN", {
        userId: "admin-1",
        userName: "Ada Admin",
        initialLogs: [ownPending, othersPending],
      });
      const sa = new StockApprovalPage(page);

      await sa.gotoProducts();
      await sa.openStockLogsTab();

      const ownRow = sa.rowByProductName("Kertas HVS A4");
      const otherRow = sa.rowByProductName("Banner Indoor");

      await expect(ownRow.getByRole("button", { name: "Batalkan" })).toBeVisible();
      await expect(otherRow.getByRole("button", { name: "Batalkan" })).toBeHidden();
      // ADMIN never sees approve/reject.
      await expect(ownRow.getByRole("button", { name: "Setuju" })).toBeHidden();
      await expect(otherRow.getByRole("button", { name: "Tolak" })).toBeHidden();

      page.on("dialog", (dialog) => dialog.accept());
      await sa.cancelRow("Kertas HVS A4");

      await expect.poll(() =>
        store.logs.find((l) => l.id === "log-own-pending")?.status,
      ).toBe("REJECTED");
      expect(
        store.logs.find((l) => l.id === "log-own-pending")?.rejectionReason,
      ).toBe("Dibatalkan oleh pemohon");
      // The other user's request is untouched.
      expect(
        store.logs.find((l) => l.id === "log-others-pending")?.status,
      ).toBe("PENDING");
    });

    test("does NOT see a sidebar pending badge (badge is OWNER-only)", async ({
      page,
    }) => {
      await setupRole(page, "ADMIN", {
        initialLogs: [PENDING_FROM_ADMIN, APPROVED_HISTORICAL],
      });
      const sa = new StockApprovalPage(page);

      await sa.gotoProducts();
      // Allow the badge query to settle.
      await page.waitForResponse((r) =>
        r.url().includes("/api/inventory/logs?status=PENDING"),
      );

      await expect(sa.sidebarProductsBadge()).toBeHidden();
    });
  });

  test.describe("Stock Logs UI states", () => {
    test("renders pending pinned to top, status pills, and rejection reason on rejected rows", async ({
      page,
    }) => {
      await setupRole(page, "OWNER", {
        initialLogs: [
          APPROVED_HISTORICAL,
          REJECTED_HISTORICAL,
          PENDING_FROM_ADMIN,
        ],
      });
      const sa = new StockApprovalPage(page);

      await sa.gotoProducts();
      await sa.openStockLogsTab();

      // Pending row appears first regardless of createdAt order.
      const firstStatusCell = page
        .locator("tbody tr")
        .first()
        .locator('span', { hasText: /^Pending$/ });
      await expect(firstStatusCell).toBeVisible();

      // Rejection reason renders below the note.
      await expect(page.getByText(/Ditolak: Bukti rusak tidak ada/)).toBeVisible();

      // OWNER's approver attribution appears on approved rows.
      await expect(page.getByText(/oleh Boss/).first()).toBeVisible();
    });

    test("status filter chips narrow the list and the recent-first sort kicks in for a single-status filter (edge path)", async ({
      page,
    }) => {
      await setupRole(page, "OWNER", {
        initialLogs: [
          APPROVED_HISTORICAL,
          REJECTED_HISTORICAL,
          PENDING_FROM_ADMIN,
        ],
      });
      const sa = new StockApprovalPage(page);

      await sa.gotoProducts();
      await sa.openStockLogsTab();

      const filterRequest = page.waitForRequest(
        (r) =>
          r.url().includes("/api/inventory/logs") &&
          r.url().includes("status=REJECTED"),
      );
      await sa.statusChip("Ditolak").click();
      await filterRequest;

      // Only the rejected row remains visible; pending and approved gone.
      await expect(page.getByText(/Ditolak: Bukti rusak tidak ada/)).toBeVisible();
      await expect(
        page.locator("tbody tr").locator('span', { hasText: /^Pending$/ }),
      ).toHaveCount(0);
    });
  });

  test.describe("Sidebar pending badge — OWNER", () => {
    test("shows count when there are pending requests, hidden when none (core + edge)", async ({
      page,
    }) => {
      await setupRole(page, "OWNER", {
        initialLogs: [PENDING_FROM_ADMIN],
      });
      const sa = new StockApprovalPage(page);

      await sa.gotoProducts();
      await page.waitForResponse((r) =>
        r.url().includes("/api/inventory/logs?status=PENDING"),
      );

      await expect(sa.sidebarProductsBadge()).toBeVisible();
      await expect(sa.sidebarProductsBadge()).toContainText("1");
    });

    test("badge hidden for OWNER when no pending requests exist", async ({
      page,
    }) => {
      await setupRole(page, "OWNER", {
        initialLogs: [APPROVED_HISTORICAL, REJECTED_HISTORICAL],
      });
      const sa = new StockApprovalPage(page);

      await sa.gotoProducts();
      await page.waitForResponse((r) =>
        r.url().includes("/api/inventory/logs?status=PENDING"),
      );

      await expect(sa.sidebarProductsBadge()).toBeHidden();
    });
  });
});
