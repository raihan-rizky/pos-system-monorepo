import { test as base, expect, type Page, type Route } from "@playwright/test";
import {
  activeShift,
  categories,
  closedShift,
  customers,
  dashboard,
  jobOrder,
  products,
  salespersons,
  storeSettings,
  transaction,
} from "./mock-data";

type Role = "OWNER" | "ADMIN" | "CASHIER" | "SALES";

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function emptyOk(route: Route) {
  await json(route, { ok: true });
}

export async function authenticate(page: Page, role: Role = "OWNER") {
  await page.context().addCookies([
    { name: "x-pos-role", value: role, domain: "localhost", path: "/" },
    { name: "x-pos-user-id", value: "e2e-user", domain: "localhost", path: "/" },
    { name: "x-pos-user-name", value: "E2E%20Owner", domain: "localhost", path: "/" },
  ]);
}

export async function mockApis(page: Page) {
  let currentJobOrder = { ...jobOrder };
  let currentStoreSettings = { ...storeSettings };

  await page.route("**/auth/v1/token**", async (route) => {
    await json(route, { error: "Invalid login credentials", msg: "Invalid login credentials" }, 400);
  });

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const path = url.pathname;

    if (path === "/api/categories") return json(route, categories);
    if (path === "/api/products" && method === "GET") return json(route, { data: products, pagination: { total: products.length, page: 1, limit: 100, totalPages: 1 } });
    if (path === "/api/products" && method === "POST") return json(route, { ...products[0], id: "prod-new" }, 201);
    if (path.startsWith("/api/products/")) return json(route, { ...products[0], name: "Updated Product" });
    if (path === "/api/inventory") return emptyOk(route);

    if (path === "/api/shifts" && method === "GET" && url.searchParams.get("active") === "true") {
      return json(route, { data: activeShift });
    }
    if (path === "/api/shifts" && method === "GET") {
      return json(route, { data: [activeShift, closedShift], pagination: { total: 2, page: 1, limit: 50, totalPages: 1, hasNextPage: false, hasPreviousPage: false } });
    }
    if (path === "/api/shifts" && method === "POST") return json(route, activeShift, 201);
    if (path === "/api/shifts" && method === "PATCH") return json(route, closedShift);
    if (path === "/api/shifts/close") return json(route, closedShift);

    if (path === "/api/transactions" && method === "GET") {
      return json(route, { data: [transaction, jobOrder], pagination: { total: 2, page: 1, limit: 50, totalPages: 1, hasNextPage: false, hasPreviousPage: false } });
    }
    if (path === "/api/transactions" && method === "POST") {
      return json(route, { ...transaction, id: "tx-new", invoiceNumber: "INV-20260509-0002" }, 201);
    }
    if (path === "/api/transactions/draft" && method === "POST") {
      return json(
        route,
        {
          id: "draft-new",
          invoiceNumber: null,
          draftNumber: "DRAFT-20260520-0001",
          status: "DRAFT",
          subtotal: 100000,
          discount: 0,
          tax: 0,
          total: 100000,
          paymentMethod: "CASH",
          amountPaid: 0,
          change: 0,
          customerName: "Pak Budi",
          customerId: null,
          salesName: null,
          salespersonId: null,
          salesperson: null,
          note: null,
          isJobOrder: false,
          createdAt: new Date().toISOString(),
          items: [
            {
              id: "draft-item-1",
              productName: "Kertas A4",
              size: null,
              material: null,
              quantity: 2,
              unitPrice: 50000,
              subtotal: 100000,
            },
          ],
        },
        201,
      );
    }
    if (path.match(/^\/api\/transactions\/[^/]+\/approve-draft$/)) {
      return json(route, {
        ...transaction,
        id: path.split("/")[3],
        invoiceNumber: "INV-20260520-0099",
        draftNumber: "DRAFT-20260520-0001",
        status: "COMPLETED",
      });
    }
    if (path.match(/^\/api\/transactions\/[^/]+\/cancel-draft$/)) {
      return json(route, { id: path.split("/")[3], status: "VOIDED" });
    }
    if (path.match(/^\/api\/transactions\/[^/]+$/)) return json(route, transaction);
    if (path.match(/^\/api\/transactions\/[^/]+\/(approve|reject)$/)) return json(route, transaction);

    if (path === "/api/dashboard") return json(route, dashboard);
    if (path === "/api/job-orders") return json(route, { data: [currentJobOrder] });
    if (path === "/api/job-orders/job-1/status") {
      const body = JSON.parse(request.postData() || "{}") as { productionStatus?: typeof jobOrder.productionStatus };
      currentJobOrder = {
        ...currentJobOrder,
        productionStatus: body.productionStatus || "PRINTING",
      };
      return json(route, currentJobOrder);
    }

    if (path === "/api/customers" && method === "GET") {
      return json(route, { data: customers, pagination: { total: customers.length, page: 1, limit: 50, totalPages: 1, hasNextPage: false, hasPreviousPage: false } });
    }
    if (path === "/api/customers" && method === "POST") return json(route, { ...customers[0], id: "cust-new" }, 201);
    if (path.startsWith("/api/customers/") && path.endsWith("/pay-debt")) return json(route, { success: true, customer: { ...customers[0], totalDebt: 0 } });
    if (path.startsWith("/api/customers/")) return json(route, customers[0]);

    if (path === "/api/salespersons" && method === "GET") return json(route, { data: salespersons });
    if (path === "/api/salespersons" && method === "POST") return json(route, { ...salespersons[0], id: "sp-new" }, 201);
    if (path.startsWith("/api/salespersons/")) return json(route, salespersons[0]);

    if (path === "/api/settings/store" && method === "GET") return json(route, currentStoreSettings);
    if (path === "/api/settings/store" && method === "PATCH") {
      currentStoreSettings = {
        ...currentStoreSettings,
        ...(JSON.parse(request.postData() || "{}") as Partial<typeof storeSettings>),
      };
      return json(route, currentStoreSettings);
    }
    if (path === "/api/settings/whatsapp/status") return json(route, { status: "CONNECTED", raw: { me: { id: "628123456789@c.us", pushName: "E2E WA" } } });
    if (path === "/api/settings/whatsapp/qr") return json(route, { value: "" });
    if (path === "/api/settings/whatsapp/pair-code") {
      return json(route, {
        code: "123-456",
        phoneNumber: "628123456789",
      });
    }
    if (path === "/api/wa/auto-reply" && method === "GET") return json(route, { isAutoReplyOn: true });
    if (path === "/api/wa/auto-reply") return json(route, { isAutoReplyOn: false });
    if (path === "/api/wa/contacts") return json(route, { data: [{ id: "628123456789@c.us", phone: "628123456789", name: "Budi WA", picture: null, role: "user", content: "Halo toko", created_at: "2026-05-09T01:00:00.000Z", image_url: null }] });
    if (path === "/api/wa/messages" && method === "GET") return json(route, { data: [{ id: "wa-1", phone: "628123456789", role: "user", content: "Halo toko", created_at: "2026-05-09T01:00:00.000Z", image_url: null }] });
    if (path === "/api/wa/messages" && method === "POST") return json(route, { data: { id: "wa-new", phone: "628123456789", role: "assistant", content: "Siap dibantu", created_at: new Date().toISOString(), image_url: null } });

    if (path === "/api/upload") return json(route, { url: "/images/icon.png" });
    if (path === "/api/push/subscriptions") return emptyOk(route);

    if (path === "/api/finance/income/summary") {
      return json(route, {
        month: "2026-05",
        monthlyTotal: 45_000_000,
        transactionCount: 312,
        daily: [
          { date: "2026-05-19", total: 1_250_000, count: 8 },
          { date: "2026-05-20", total: 2_100_000, count: 14 },
        ],
      });
    }
    if (path === "/api/finance/expenses/summary" && method === "GET") {
      return json(route, {
        month: "2026-05",
        monthlyTotal: 850_000,
        entryCount: 2,
        byCategory: [
          { category: "SUPPLIES", total: 500_000 },
          { category: "BEVERAGES", total: 350_000 },
        ],
        daily: [
          {
            date: "2026-05-20",
            total: 850_000,
            byCategory: { SUPPLIES: 500_000, BEVERAGES: 350_000 },
          },
        ],
        netCashFlow: { income: 45_000_000, expense: 850_000, net: 44_150_000 },
      });
    }
    if (path === "/api/finance/expenses" && method === "POST") {
      return json(
        route,
        {
          data: {
            id: "exp-new",
            applicantName: "Pak Budi",
            category: "SUPPLIES",
            description: null,
            amount: 100_000,
            changeAmount: 0,
            netAmount: 100_000,
            occurredAt: "2026-05-20T00:00:00.000Z",
            createdAt: new Date().toISOString(),
            transactionId: null,
            attachmentUrl: null,
          },
        },
        201,
      );
    }
    if (path === "/api/finance/expenses" && method === "GET") {
      return json(route, {
        data: [
          {
            id: "exp-1",
            applicantName: "Pak Budi",
            category: "SUPPLIES",
            description: "Kertas A4",
            amount: 500_000,
            changeAmount: 0,
            netAmount: 500_000,
            occurredAt: "2026-05-20T01:00:00.000Z",
            createdAt: "2026-05-20T01:00:00.000Z",
            transactionId: null,
            attachmentUrl: null,
            recordedBy: { id: "e2e-user", name: "E2E Owner" },
          },
          {
            id: "exp-2",
            applicantName: "Sari",
            category: "BEVERAGES",
            description: null,
            amount: 350_000,
            changeAmount: 0,
            netAmount: 350_000,
            occurredAt: "2026-05-20T02:00:00.000Z",
            createdAt: "2026-05-20T02:00:00.000Z",
            transactionId: null,
            attachmentUrl: null,
            recordedBy: { id: "e2e-user", name: "E2E Owner" },
          },
        ],
        pagination: {
          total: 2,
          page: 1,
          limit: 50,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      });
    }
    if (path.match(/^\/api\/finance\/expenses\/[^/]+$/) && method === "DELETE") {
      return json(route, {
        data: { id: path.split("/").pop(), deletedAt: new Date().toISOString() },
      });
    }

    if (path === "/api/finance/report" && method === "GET") {
      return json(route, {
        dateFrom: url.searchParams.get("dateFrom") || "2026-05-01",
        dateTo: url.searchParams.get("dateTo") || "2026-05-20",
        summary: {
          transactionCount: 12,
          revenue: 4_500_000,
          collected: 4_200_000,
          grossProfit: 1_500_000,
          grossMargin: 0.333,
          discount: 0,
          outstandingDp: 300_000,
          shiftDiscrepancy: 0,
          missingCostLineCount: 0,
          lossStokNet: 250_000,
          lossStokUnclassifiedCount: 1,
        },
        paymentMethods: [
          { method: "CASH", transactionCount: 8, revenue: 3_000_000, collected: 3_000_000 },
          { method: "TRANSFER", transactionCount: 4, revenue: 1_500_000, collected: 1_200_000 },
        ],
        topProducts: [
          { productId: "prod-1", productName: "Kertas A4", quantity: 20, revenue: 1_000_000, grossProfit: 400_000 },
        ],
        categories: [
          { categoryName: "Alat Tulis", quantity: 30, revenue: 2_500_000, grossProfit: 800_000, transactionCount: 8 },
        ],
        salespersons: [
          { name: "Budi", transactionCount: 6, revenue: 2_000_000, collected: 1_900_000, grossProfit: 700_000 },
        ],
        shifts: [],
        lossStok: [
          { reason: "WASTE", netValue: 200_000, netQuantity: 4, entryCount: 2 },
          { reason: "OPNAME", netValue: 50_000, netQuantity: 1, entryCount: 1 },
          { reason: "UNCLASSIFIED", netValue: 0, netQuantity: 1, entryCount: 1 },
        ],
      });
    }

    if (path === "/api/finance/report/journal" && method === "GET") {
      const period = url.searchParams.get("period") || "daily";
      return json(route, {
        period,
        from: "2026-05-20",
        to: "2026-05-20",
        rows: [
          {
            tanggal: "2026-05-20",
            invoice: "INV-20260520-0001",
            person: "Budi",
            products: "Kertas A4",
            categories: "Alat Tulis",
            status: "Pemasukan",
            amount: 100_000,
            method: "CASH",
          },
          {
            tanggal: "2026-05-20",
            invoice: "EXP-exp-1",
            person: "Pak Budi",
            products: "Kertas A4",
            categories: "Perlengkapan",
            status: "Pengeluaran",
            amount: -50_000,
            method: "",
          },
        ],
        footer: {
          totalPemasukan: 100_000,
          totalPengeluaran: -50_000,
          grandTotal: 50_000,
          byMethod: { CASH: 100_000, TRANSFER: 0, QRIS: 0, DEBIT: 0, CREDIT: 0 },
        },
      });
    }

    return json(route, { message: `Unhandled E2E mock: ${method} ${path}` }, 501);
  });
}

export const test = base.extend<{ appPage: Page }>({
  appPage: async ({ page }, use) => {
    await authenticate(page);
    await mockApis(page);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect };
