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
    if (path === "/api/products" && method === "GET") return json(route, products);
    if (path === "/api/products" && method === "POST") return json(route, { ...products[0], id: "prod-new" }, 201);
    if (path.startsWith("/api/products/")) return json(route, { ...products[0], name: "Updated Product" });
    if (path === "/api/inventory") return emptyOk(route);

    if (path === "/api/shifts" && method === "GET" && url.searchParams.get("active") === "true") {
      return json(route, { data: activeShift });
    }
    if (path === "/api/shifts" && method === "GET") {
      return json(route, { data: [activeShift, closedShift], total: 2, page: 1, totalPages: 1 });
    }
    if (path === "/api/shifts" && method === "POST") return json(route, activeShift, 201);
    if (path === "/api/shifts" && method === "PATCH") return json(route, closedShift);
    if (path === "/api/shifts/close") return json(route, closedShift);

    if (path === "/api/transactions" && method === "GET") {
      return json(route, { data: [transaction, jobOrder], total: 2, page: 1, totalPages: 1 });
    }
    if (path === "/api/transactions" && method === "POST") {
      return json(route, { ...transaction, id: "tx-new", invoiceNumber: "INV-20260509-0002" }, 201);
    }
    if (path.match(/^\/api\/transactions\/[^/]+$/)) return json(route, transaction);
    if (path.match(/^\/api\/transactions\/[^/]+\/(approve|reject)$/)) return json(route, transaction);

    if (path === "/api/dashboard") return json(route, dashboard);
    if (path === "/api/job-orders") return json(route, [currentJobOrder]);
    if (path === "/api/job-orders/job-1/status") {
      const body = JSON.parse(request.postData() || "{}") as { productionStatus?: typeof jobOrder.productionStatus };
      currentJobOrder = {
        ...currentJobOrder,
        productionStatus: body.productionStatus || "DESIGNING",
      };
      return json(route, currentJobOrder);
    }

    if (path === "/api/customers" && method === "GET") {
      return json(route, { data: customers, total: customers.length, page: 1, totalPages: 1 });
    }
    if (path === "/api/customers" && method === "POST") return json(route, { ...customers[0], id: "cust-new" }, 201);
    if (path.startsWith("/api/customers/") && path.endsWith("/pay-debt")) return json(route, { success: true, customer: { ...customers[0], totalDebt: 0 } });
    if (path.startsWith("/api/customers/")) return json(route, customers[0]);

    if (path === "/api/salespersons" && method === "GET") return json(route, salespersons);
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

    return json(route, { message: `Unhandled E2E mock: ${method} ${path}` }, 501);
  });
}

export const test = base.extend<{ appPage: Page }>({
  appPage: async ({ page }, use) => {
    await authenticate(page);
    await mockApis(page);
    await use(page);
  },
});

export { expect };
