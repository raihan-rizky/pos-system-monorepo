import { db } from "@pos/db";
import {
  isJakartaSaturday,
  jakartaDateKey,
  jakartaWeekKey,
} from "../helpers/inventory-management-rules";

export const WORKSPACE_SAFETY_ITEMS = [
  { id: "machine-area", label: "Area mesin printing bersih dan siap dipakai" },
  { id: "paper-area", label: "Area kertas, ATK, dan bahan produksi tertata" },
  { id: "cutting-tools", label: "Cutter, alat potong, dan laminator dalam kondisi aman" },
  { id: "waste-area", label: "Area barang rusak/sampah produksi sudah dipisahkan" },
  { id: "walkway", label: "Jalur kerja dan meja produksi tidak terhalang" },
] as const;

export interface InventoryDaySessionCompletion {
  dateKey: string;
  weekKey: string;
  isSaturday: boolean;
  tasks: Array<{ id: string; label: string; completed: boolean; required: boolean }>;
  blockers: string[];
}

export async function loadStockRiskItems(storeId: string, take = 8) {
  const select = {
    id: true,
    name: true,
    sku: true,
    stock: true,
    minStock: true,
    unit: true,
  };

  const [negative, outOfStock, lowStockCandidates] = await Promise.all([
    db.product.findMany({
      where: { storeId, isActive: true, stock: { lt: 0 } },
      select,
      orderBy: [{ stock: "asc" }, { name: "asc" }],
      take,
    }),
    db.product.findMany({
      where: { storeId, isActive: true, stock: 0 },
      select,
      orderBy: { name: "asc" },
      take,
    }),
    db.product.findMany({
      where: { storeId, isActive: true, stock: { gt: 0 } },
      select,
      orderBy: [{ stock: "asc" }, { name: "asc" }],
      take: take * 4,
    }),
  ]);

  return {
    negative,
    outOfStock,
    lowStock: lowStockCandidates
      .filter((product) => product.stock <= product.minStock)
      .slice(0, take),
  };
}

export async function loadProductionMaterials(storeId: string, take = 8) {
  const pinned = await db.inventoryProductionMaterial.findMany({
    where: { storeId, isPinned: true },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          stock: true,
          minStock: true,
          unit: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take,
  });

  const pinnedIds = new Set(pinned.map((item) => item.productId));
  const usage = await db.transactionItem.groupBy({
    by: ["rawMaterialProductId"],
    where: {
      rawMaterialProductId: { not: null },
      transaction: { storeId },
    },
    _count: { rawMaterialProductId: true },
    orderBy: { _count: { rawMaterialProductId: "desc" } },
    take: take * 3,
  });
  const autoIds = usage
    .flatMap((item) => item.rawMaterialProductId ? [item.rawMaterialProductId] : [])
    .filter((id) => !pinnedIds.has(id))
    .slice(0, Math.max(0, take - pinned.length));

  const autoProducts =
    autoIds.length > 0
      ? await db.product.findMany({
          where: { id: { in: autoIds }, storeId, isActive: true },
          select: {
            id: true,
            name: true,
            sku: true,
            stock: true,
            minStock: true,
            unit: true,
          },
        })
      : [];

  const autoProductById = new Map(autoProducts.map((product) => [product.id, product]));
  return [
    ...pinned.map((item) => ({ source: "PINNED" as const, product: item.product })),
    ...autoIds
      .map((id) => autoProductById.get(id))
      .filter((product): product is NonNullable<typeof product> => Boolean(product))
      .map((product) => ({ source: "AUTO" as const, product })),
  ];
}

export async function loadInventoryDaySession(storeId: string, dateKey: string) {
  return db.inventoryDaySession.findUnique({
    where: { storeId_periodKey: { storeId, periodKey: dateKey } },
  });
}

export async function buildInventoryDaySessionPreview(storeId: string, now = new Date()) {
  const dateKey = jakartaDateKey(now);
  const [session, stockRisk, productionMaterials, completion] = await Promise.all([
    loadInventoryDaySession(storeId, dateKey),
    loadStockRiskItems(storeId),
    loadProductionMaterials(storeId),
    buildInventoryDayCompletion(storeId, dateKey, now),
  ]);

  return {
    dateKey,
    session,
    stockRisk,
    productionMaterials,
    workspaceSafetyItems: WORKSPACE_SAFETY_ITEMS,
    completion,
  };
}

export async function buildInventoryDayCompletion(
  storeId: string,
  dateKey: string,
  now = new Date(),
): Promise<InventoryDaySessionCompletion> {
  const weekKey = jakartaWeekKey(now);
  const isSaturday = isJakartaSaturday(now);
  const [
    session,
    dailyMatching,
    unverifiedOutLogs,
    damagedReportsPending,
    dailyChecklistRemaining,
    unmarkedSuratJalan,
    weeklyProof,
  ] = await Promise.all([
    loadInventoryDaySession(storeId, dateKey),
    db.inventoryTask.findUnique({
      where: {
        storeId_type_periodKey: {
          storeId,
          type: "DAILY_STOCK_MATCHING",
          periodKey: dateKey,
        },
      },
      select: { status: true },
    }),
    db.inventoryLog.count({
      where: {
        type: "OUT",
        status: "APPROVED",
        product: { storeId },
        verification: null,
        OR: [{ reason: "USAGE" }, { reason: "MANUAL_ADJUSTMENT" }],
      },
    }),
    db.inventoryLog.count({
      where: { status: "PENDING", reason: "WASTE", product: { storeId } },
    }),
    db.inventoryTaskChecklistItem.count({
      where: {
        storeId,
        periodType: "DAILY",
        periodKey: dateKey,
        isCompleted: false,
      },
    }),
    db.suratJalan.count({
      where: { storeId, markingStatus: "UNMARKED" },
    }),
    db.inventoryTask.findUnique({
      where: {
        storeId_type_periodKey: {
          storeId,
          type: "WEEKLY_CLEANING_PROOF",
          periodKey: weekKey,
        },
      },
      select: { status: true },
    }),
  ]);

  const tasks = [
    {
      id: "morning-check",
      label: "Morning Check selesai",
      completed: session?.status === "CHECKED_IN" || session?.status === "CHECKED_OUT",
      required: true,
    },
    {
      id: "daily-matching",
      label: "Matching stok harian tersubmit",
      completed: dailyMatching?.status === "SUBMITTED",
      required: true,
    },
    {
      id: "out-log-verification",
      label: "Log OUT sudah diverifikasi",
      completed: unverifiedOutLogs === 0,
      required: true,
    },
    {
      id: "damaged-reports",
      label: "Laporan barang rusak pending selesai",
      completed: damagedReportsPending === 0,
      required: true,
    },
    {
      id: "manual-checklist",
      label: "Checklist manual harian selesai",
      completed: dailyChecklistRemaining === 0,
      required: true,
    },
    {
      id: "surat-jalan-marking",
      label: "Semua Surat Jalan sudah dimarking atau diberi catatan pengecualian",
      completed: unmarkedSuratJalan === 0,
      required: true,
    },
    {
      id: "weekly-proof",
      label: "Proof kebersihan mingguan",
      completed: weeklyProof?.status === "SUBMITTED",
      required: isSaturday,
    },
  ];

  return {
    dateKey,
    weekKey,
    isSaturday,
    tasks,
    blockers: tasks
      .filter((task) => task.required && !task.completed)
      .map((task) => task.label),
  };
}
