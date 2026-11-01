import type { Prisma } from "@pos/db";
import type {
  DatabaseResetDomain,
  DatabaseResetModel,
  DatabaseResetOperation,
  DatabaseResetPlan,
  DatabaseResetReadClient,
  DatabaseResetSummary,
  DatabaseResetTransactionClient,
  DatabaseResetWhere,
} from "../types/database-reset";
import {
  DATABASE_RESET_DOMAINS,
  DATABASE_RESET_MODELS,
  PRESERVED_DATABASE_RESET_DATA,
  REQUIRED_DEPENDENCIES,
} from "./database-reset-registry";
import { DATABASE_RESET_MODEL_LABELS, DATABASE_RESET_OPTIONS, DATABASE_RESET_SELECTABLE_MODELS } from "./database-reset-options";
import { DATABASE_RESET_CASCADE_WHERE, DATABASE_RESET_CHILDREN, DATABASE_RESET_SUBDATA_DEPENDENCIES } from "./database-reset-subdata";

type Delegate = {
  count: (args: { where: Record<string, unknown> }) => Promise<number>;
  deleteMany: (args: { where: Record<string, unknown> }) => Promise<{ count: number }>;
};

function getDelegate(client: DatabaseResetReadClient | DatabaseResetTransactionClient, delegate: string) {
  return (client as unknown as Record<string, Delegate>)[delegate];
}

async function countModel(db: DatabaseResetReadClient, model: keyof typeof DATABASE_RESET_MODELS, where: Record<string, unknown>) {
  const definition = DATABASE_RESET_MODELS[model];
  return getDelegate(db, definition.delegate).count({ where });
}

export async function createDatabaseResetPlan(input: {
  db: DatabaseResetReadClient;
  storeId: string;
  domains?: readonly DatabaseResetDomain[];
  models?: readonly DatabaseResetModel[];
}): Promise<DatabaseResetPlan> {
  if (input.domains !== undefined && input.models !== undefined) throw new Error("Pilih kategori atau sub-data, bukan keduanya.");
  const models = input.models === undefined ? undefined : [...new Set(input.models)];
  if (models?.some(model => !DATABASE_RESET_SELECTABLE_MODELS.includes(model))) throw new Error("Sub-data reset tidak valid.");
  const domains = models === undefined
    ? [...new Set(input.domains)]
    : DATABASE_RESET_OPTIONS.filter(option => option.items.some(item => models.includes(item.model))).map(option => option.id);
  const operations = new Map<string, DatabaseResetOperation>();
  const cascades: DatabaseResetPlan["cascades"] = [];
  const entries: Array<{ model: DatabaseResetModel; domain: DatabaseResetDomain; mode: "selected" | "cascade"; reason: string; where?: DatabaseResetWhere }> = [];

  if (models !== undefined) {
    const append = (model: DatabaseResetModel, domain: DatabaseResetDomain, parent?: DatabaseResetModel) => {
      entries.push({ model, domain, mode: parent ? "cascade" : "selected", reason: parent ? `Wajib ikut terhapus bersama ${DATABASE_RESET_MODEL_LABELS[parent]}.` : DATABASE_RESET_MODEL_LABELS[model], where: parent ? DATABASE_RESET_CASCADE_WHERE[parent]?.[model]?.(input.storeId) : undefined });
      for (const child of DATABASE_RESET_CHILDREN[model] ?? []) append(child, domain, model);
    };
    for (const model of models) {
      const domain = DATABASE_RESET_OPTIONS.find(option => option.items.some(item => item.model === model))!.id;
      append(model, domain);
    }
  } else {
    for (const domain of domains) {
      for (const entry of DATABASE_RESET_DOMAINS[domain]) entries.push({ ...entry, domain });
    }
  }

  for (const entry of entries) {
    const domain = entry.domain;
    const definition = DATABASE_RESET_MODELS[entry.model];
    const current = operations.get(entry.model);
    const operation: DatabaseResetOperation = {
      model: entry.model,
      domain,
      mode: entry.mode,
      reason: entry.reason,
      count: await countModel(input.db, entry.model, entry.where ?? definition.where(input.storeId)),
      where: entry.where ?? definition.where(input.storeId),
    };

    if (!current || (current.mode === "cascade" && entry.mode === "selected")) {
      operations.set(entry.model, operation);
    } else if (current.mode === "cascade" && JSON.stringify(current.where) !== JSON.stringify(operation.where)) {
      current.where = { OR: [current.where, operation.where] };
      current.count = await countModel(input.db, current.model, current.where);
    }

    if (entry.mode === "cascade" && !cascades.some(item => item.model === entry.model && item.sourceDomain === domain)) {
      cascades.push({
        model: entry.model,
        count: operation.count,
        reason: entry.reason,
        sourceDomain: domain,
      });
    }
  }

  for (const cascade of cascades) cascade.count = operations.get(cascade.model)!.count;

  const requiredDependencies: DatabaseResetPlan["requiredDependencies"] = [];
  if (models !== undefined) {
    for (const dependency of DATABASE_RESET_SUBDATA_DEPENDENCIES) {
      if (!operations.has(dependency.source)) continue;
      const definition = DATABASE_RESET_MODELS[dependency.reference];
      const count = await countModel(input.db, dependency.reference, dependency.where?.(input.storeId) ?? definition.where(input.storeId));
      if (count === 0 || requiredDependencies.some(item => item.model === dependency.target)) continue;
      requiredDependencies.push({
        domain: DATABASE_RESET_OPTIONS.find(option => option.items.some(item => item.model === dependency.target))!.id,
        model: dependency.target,
        reason: `${DATABASE_RESET_MODEL_LABELS[dependency.source]} masih terhubung ke ${DATABASE_RESET_MODEL_LABELS[dependency.target]}. Pilih sub-data ini untuk melanjutkan.`,
        blocking: !operations.has(dependency.target),
      });
    }
  } else for (const dependency of REQUIRED_DEPENDENCIES) {
    if (!domains.includes(dependency.source)) continue;
    const definition = DATABASE_RESET_MODELS[dependency.model];
    const count = await countModel(
      input.db,
      dependency.model,
      dependency.where?.(input.storeId) ?? definition.where(input.storeId),
    );
    if (count === 0) continue;
    requiredDependencies.push({
      domain: dependency.target,
      reason: dependency.reason,
      blocking: !domains.includes(dependency.target),
    });
  }

  if (operations.has("Customer") && await input.db.customerReceivable.count({ where: { storeId: input.storeId } }) > 0) {
    requiredDependencies.push({ domain: "customers", model: "Customer", blocking: true, reason: "Pelanggan masih memiliki riwayat piutang manual yang dilindungi, termasuk yang sudah lunas. Data pelanggan ini tidak dapat di-reset." });
  }

  const prioritizedOperations = [...operations.values()].sort((left, right) => {
    const priorityDifference = DATABASE_RESET_MODELS[left.model].priority - DATABASE_RESET_MODELS[right.model].priority;
    return priorityDifference || left.model.localeCompare(right.model);
  });
  const sortedOperations: DatabaseResetOperation[] = [];
  const visited = new Set<DatabaseResetModel>();
  const visit = (operation: DatabaseResetOperation) => {
    if (visited.has(operation.model)) return;
    visited.add(operation.model);
    const predecessors = [
      ...(DATABASE_RESET_CHILDREN[operation.model] ?? []),
      ...DATABASE_RESET_SUBDATA_DEPENDENCIES.filter(dependency => dependency.source === operation.model).map(dependency => dependency.target),
      ...(operation.model === "TransactionItem" ? ["SuratJalanItem" as const] : []),
    ];
    for (const model of predecessors) {
      const predecessor = operations.get(model);
      if (predecessor) visit(predecessor);
    }
    sortedOperations.push(operation);
  };
  for (const operation of prioritizedOperations) visit(operation);

  return {
    storeId: input.storeId,
    domains,
    ...(models === undefined ? {} : { models }),
    operations: sortedOperations,
    cascades,
    requiredDependencies,
    preserved: PRESERVED_DATABASE_RESET_DATA.filter(item => item.model !== "Nota Percetakan" || !operations.has("PrintingReceipt")),
    canExecute: operations.size > 0 && requiredDependencies.every((dependency) => !dependency.blocking),
  };
}

export async function executeDatabaseResetPlan(
  tx: Prisma.TransactionClient,
  plan: DatabaseResetPlan,
): Promise<DatabaseResetSummary> {
  const deleted: DatabaseResetSummary["deleted"] = [];
  for (const operation of plan.operations) {
    const definition = DATABASE_RESET_MODELS[operation.model];
    const result = await getDelegate(tx, definition.delegate).deleteMany({ where: operation.where });
    deleted.push({ model: operation.model, count: result.count });
  }

  return { deleted, executedAt: new Date().toISOString() };
}
