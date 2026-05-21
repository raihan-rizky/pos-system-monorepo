import type { Page, Route } from "@playwright/test";

export type StockLogStatus = "PENDING" | "APPROVED" | "REJECTED";

export type MockStockLog = {
  id: string;
  productId: string;
  type: "IN" | "OUT" | "ADJUSTMENT";
  reason: string | null;
  quantity: number;
  unitCost: number | null;
  note: string | null;
  createdBy: string | null;
  person: string | null;
  createdAt: string;
  status: StockLogStatus;
  approvedBy: string | null;
  approverName: string | null;
  decidedAt: string | null;
  rejectionReason: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    unit: string;
    stock: number;
    imageUrl: string | null;
    category: { name: string; icon: string | null };
  };
};

const STATUS_ORDER: Record<StockLogStatus, number> = {
  PENDING: 0,
  APPROVED: 1,
  REJECTED: 2,
};

async function jsonReply(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function pickIdFromUrl(url: string, suffix: string) {
  const path = new URL(url).pathname;
  const match = new RegExp(`/api/inventory/([^/]+)/${suffix}`).exec(path);
  return match?.[1] ?? null;
}

export async function setupStockApprovalRoutes(
  page: Page,
  options: {
    initialLogs?: MockStockLog[];
    currentUserId?: string;
    currentUserName?: string;
    currentUserRole?: "OWNER" | "ADMIN" | "CASHIER" | "SALES";
  } = {},
) {
  const userId = options.currentUserId ?? "e2e-user";
  const userName = options.currentUserName ?? "E2E User";
  const role = options.currentUserRole ?? "OWNER";
  const store: { logs: MockStockLog[] } = {
    logs: [...(options.initialLogs ?? [])],
  };

  await page.route("**/api/inventory/logs**", async (route) => {
    const url = new URL(route.request().url());
    const statusParam = url.searchParams.get("status");
    const typeParam = url.searchParams.get("type");
    const limit = Math.max(1, Number(url.searchParams.get("limit") ?? "20") || 20);
    const pageNum = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

    const requestedStatuses = (statusParam ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s): s is StockLogStatus =>
        ["PENDING", "APPROVED", "REJECTED"].includes(s),
      );

    let filtered = store.logs;
    if (typeParam === "IN" || typeParam === "OUT" || typeParam === "ADJUSTMENT") {
      filtered = filtered.filter((l) => l.type === typeParam);
    }
    if (requestedStatuses.length > 0) {
      filtered = filtered.filter((l) => requestedStatuses.includes(l.status));
    }

    const ordered =
      requestedStatuses.length === 1
        ? [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [...filtered].sort((a, b) => {
            const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
            if (diff !== 0) return diff;
            return b.createdAt.localeCompare(a.createdAt);
          });

    const sliced = ordered.slice((pageNum - 1) * limit, pageNum * limit);
    const pendingTotal = store.logs.filter((l) => l.status === "PENDING").length;
    const total = filtered.length;

    return jsonReply(route, {
      data: sliced,
      pagination: {
        total,
        page: pageNum,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
        hasNextPage: pageNum * limit < total,
        hasPreviousPage: pageNum > 1,
        pendingTotal,
      },
    });
  });

  await page.route("**/api/inventory/*/approve", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const id = pickIdFromUrl(route.request().url(), "approve");
    const log = store.logs.find((l) => l.id === id);
    if (!log) return jsonReply(route, { message: "Permintaan tidak ditemukan" }, 404);
    if (log.status !== "PENDING") {
      return jsonReply(
        route,
        { message: "Permintaan sudah diputuskan", currentStatus: log.status },
        409,
      );
    }
    log.status = "APPROVED";
    log.approvedBy = userId;
    log.approverName = userName;
    log.decidedAt = new Date().toISOString();
    return jsonReply(route, { log });
  });

  await page.route("**/api/inventory/*/reject", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const id = pickIdFromUrl(route.request().url(), "reject");
    const body = JSON.parse(route.request().postData() ?? "{}") as { reason?: string };
    const reason = (body.reason ?? "").trim();
    if (!reason) {
      return jsonReply(route, { message: "Alasan penolakan wajib diisi" }, 422);
    }
    const log = store.logs.find((l) => l.id === id);
    if (!log) return jsonReply(route, { message: "Permintaan tidak ditemukan" }, 404);
    if (log.status !== "PENDING") {
      return jsonReply(
        route,
        { message: "Permintaan sudah diputuskan", currentStatus: log.status },
        409,
      );
    }
    log.status = "REJECTED";
    log.approvedBy = userId;
    log.approverName = userName;
    log.decidedAt = new Date().toISOString();
    log.rejectionReason = reason;
    return jsonReply(route, { log });
  });

  await page.route("**/api/inventory/*/cancel", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const id = pickIdFromUrl(route.request().url(), "cancel");
    const log = store.logs.find((l) => l.id === id);
    if (!log) return jsonReply(route, { message: "Permintaan tidak ditemukan" }, 404);
    if (log.status !== "PENDING") {
      return jsonReply(
        route,
        { message: "Permintaan sudah diputuskan", currentStatus: log.status },
        409,
      );
    }
    const isOwner = role === "OWNER";
    if (log.createdBy !== userId && !isOwner) {
      return jsonReply(
        route,
        { message: "Tidak diizinkan membatalkan permintaan ini" },
        403,
      );
    }
    log.status = "REJECTED";
    log.approvedBy = userId;
    log.approverName = userName;
    log.decidedAt = new Date().toISOString();
    log.rejectionReason = "Dibatalkan oleh pemohon";
    return jsonReply(route, { log });
  });

  await page.route("**/api/inventory", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const body = JSON.parse(route.request().postData() ?? "{}") as {
      productId: string;
      type: "IN" | "OUT" | "ADJUSTMENT";
      reason: string;
      quantity: number;
      note?: string | null;
    };
    const isOwner = role === "OWNER";
    const now = new Date().toISOString();
    const newLog: MockStockLog = {
      id: `log-new-${store.logs.length + 1}`,
      productId: body.productId,
      type: body.type,
      reason: body.reason,
      quantity: Math.abs(body.quantity),
      unitCost: null,
      note: body.note ?? null,
      createdBy: userId,
      person: userName,
      createdAt: now,
      status: isOwner ? "APPROVED" : "PENDING",
      approvedBy: isOwner ? userId : null,
      approverName: isOwner ? userName : null,
      decidedAt: isOwner ? now : null,
      rejectionReason: null,
      product: {
        id: body.productId,
        name: "Kertas HVS A4",
        sku: "HVS-A4",
        unit: "rim",
        stock: 24,
        imageUrl: null,
        category: { name: "ATK", icon: "A" },
      },
    };
    store.logs.unshift(newLog);
    return jsonReply(route, { log: newLog, status: newLog.status }, 201);
  });

  return store;
}

export function makeStockLog(overrides: Partial<MockStockLog> = {}): MockStockLog {
  const id = overrides.id ?? `log-${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    productId: "prod-a4",
    type: "IN",
    reason: "RESTOCK",
    quantity: 5,
    unitCost: null,
    note: null,
    createdBy: null,
    person: null,
    createdAt: "2026-05-20T01:00:00.000Z",
    status: "PENDING",
    approvedBy: null,
    approverName: null,
    decidedAt: null,
    rejectionReason: null,
    product: {
      id: "prod-a4",
      name: "Kertas HVS A4",
      sku: "HVS-A4",
      unit: "rim",
      stock: 24,
      imageUrl: null,
      category: { name: "ATK", icon: "A" },
    },
    ...overrides,
  };
}
