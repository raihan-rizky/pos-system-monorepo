import type { Prisma } from "@pos/db";
import type {
  DatabaseResetDomain,
  DatabaseResetOperation,
  DatabaseResetPlan,
  DatabaseResetReadClient,
  DatabaseResetSummary,
  DatabaseResetTransactionClient,
} from "../types/database-reset";
import {
  DATABASE_RESET_DOMAINS,
  DATABASE_RESET_MODELS,
  PRESERVED_DATABASE_RESET_DATA,
  REQUIRED_DEPENDENCIES,
} from "./database-reset-registry";

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
  domains: readonly DatabaseResetDomain[];
}): Promise<DatabaseResetPlan> {
  const domains = [...new Set(input.domains)];
  const operations = new Map<string, DatabaseResetOperation>();
  const cascades: DatabaseResetPlan["cascades"] = [];

  for (const domain of domains) {
    for (const entry of DATABASE_RESET_DOMAINS[domain]) {
      const definition = DATABASE_RESET_MODELS[entry.model];
      const current = operations.get(entry.model);
      const operation: DatabaseResetOperation = {
        model: entry.model,
        domain,
        mode: entry.mode,
        reason: entry.reason,
        count: await countModel(input.db, entry.model, definition.where(input.storeId)),
        where: definition.where(input.storeId),
      };

      if (!current || (current.mode === "cascade" && entry.mode === "selected")) {
        operations.set(entry.model, operation);
      } else if (current) {
        current.count = Math.max(current.count, operation.count);
      }

      if (entry.mode === "cascade") {
        cascades.push({
          model: entry.model,
          count: operation.count,
          reason: entry.reason,
          sourceDomain: domain,
        });
      }
    }
  }

  const requiredDependencies: DatabaseResetPlan["requiredDependencies"] = [];
  for (const dependency of REQUIRED_DEPENDENCIES) {
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

  const sortedOperations = [...operations.values()].sort((left, right) => {
    const priorityDifference = DATABASE_RESET_MODELS[left.model].priority - DATABASE_RESET_MODELS[right.model].priority;
    return priorityDifference || left.model.localeCompare(right.model);
  });

  return {
    storeId: input.storeId,
    domains,
    operations: sortedOperations,
    cascades,
    requiredDependencies,
    preserved: [...PRESERVED_DATABASE_RESET_DATA],
    canExecute: domains.length > 0 && requiredDependencies.every((dependency) => !dependency.blocking),
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
