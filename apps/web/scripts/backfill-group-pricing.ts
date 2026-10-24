import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  initializeGroupPricing,
  roundMoney,
  decimalToRatio,
  type GroupPricingConfig,
  type GroupPricingInput,
  type GroupPricingProjection,
} from "../features/product-stock-groups/automatic-pricing";

export type GroupPricingInitializationRequest = {
  storeId: string;
  groupId: string;
  expectedInitializationVersion: null;
};
/** The adapter must lock, reread, initialize, persist and audit in one transaction.
 * It must return a no-op projection if another transaction initialized first. */
export type ApplyGroupPricingInitialization = (
  request: GroupPricingInitializationRequest,
) => Promise<GroupPricingProjection>;

export async function runGroupPricingBackfill(input: {
  groups: AsyncIterable<GroupPricingInput>;
  apply?: boolean;
  applyGroup?: ApplyGroupPricingInitialization;
}) {
  if (input.apply && !input.applyGroup) {
    throw new Error("Penerapan memerlukan adapter transaksi dengan penguncian dan audit HPP.");
  }
  const result = {
    scanned: 0, initialized: 0, pending: 0, skipped: 0,
    groups: [] as Array<{
      storeId: string;
      groupId: string;
      projection: GroupPricingProjection;
      costChanges: Array<{ productId: string; before: string | null; after: string | null }>;
    }>,
  };
  for await (const group of input.groups) {
    result.scanned++;
    if (group.config) { initializeGroupPricing(group); result.skipped++; continue; }
    const preview = initializeGroupPricing(group);
    const projection = input.apply
      ? await input.applyGroup!({ storeId: group.storeId, groupId: group.groupId, expectedInitializationVersion: null })
      : preview;
    if (input.apply) {
      if (projection.initialized) result.initialized++;
      else result.skipped++;
    }
    else result.pending++;
    const costChanges = projection.members.flatMap(member => {
      const old = group.members.find(value => value.id === member.productId);
      const before = old?.costPrice == null ? null : roundMoney(decimalToRatio(old.costPrice));
      return before === member.costPrice ? [] : [{ productId: member.productId, before, after: member.costPrice }];
    });
    result.groups.push({ storeId: group.storeId, groupId: group.groupId, projection, costChanges });
  }
  return result;
}

async function* databaseGroups(): AsyncGenerator<GroupPricingInput> {
  const { db } = await import("@pos/db");
  let cursor: string | undefined;
  try {
    while (true) {
      const batch = await db.productStockGroup.findMany({
        take: 100, orderBy: { id: "asc" },
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true, storeId: true, baseUnit: true, pricingConfig: true,
          products: { orderBy: { id: "asc" }, select: {
            id: true, storeId: true, stockGroupId: true, unit: true,
            price: true, costPrice: true, unitMultiplierToBase: true,
            isActive: true, conversionNeedsReview: true,
          } },
        },
      });
      if (!batch.length) return;
      for (const group of batch) yield {
        groupId: group.id, storeId: group.storeId, baseUnit: group.baseUnit,
        config: group.pricingConfig as GroupPricingConfig | null,
        members: group.products.map(member => ({
          id: member.id, storeId: member.storeId, groupId: member.stockGroupId!, unit: member.unit,
          price: member.price.toString(), costPrice: member.costPrice?.toString() ?? null,
          unitMultiplierToBase: member.unitMultiplierToBase,
          isActive: member.isActive, conversionNeedsReview: member.conversionNeedsReview,
        })),
      };
      cursor = batch[batch.length - 1].id;
    }
  } finally { await db.$disconnect(); }
}

export async function groupPricingBackfillMain(args: string[]) {
  const apply = args.includes("--apply");
  const adapterPath = args.find(arg => arg.startsWith("--adapter="))?.slice(10);
  const inputPath = args.find(arg => arg.startsWith("--input="))?.slice(8);
  if (args.some(arg => !["--apply", "--dry-run"].includes(arg) && !arg.startsWith("--adapter=") && !arg.startsWith("--input="))) {
    throw new Error("Argumen tidak dikenal. Gunakan --dry-run atau --apply --adapter=berkas.");
  }
  if (apply && (args.includes("--dry-run") || !adapterPath || inputPath)) {
    throw new Error("Penerapan memerlukan --adapter tanpa --dry-run atau --input.");
  }
  let applyGroup: ApplyGroupPricingInitialization | undefined;
  if (adapterPath) {
    const adapter = await import(pathToFileURL(resolve(adapterPath)).href);
    if (typeof adapter.applyGroupPricingInitialization !== "function") {
      throw new Error("Adapter harus mengekspor applyGroupPricingInitialization.");
    }
    applyGroup = adapter.applyGroupPricingInitialization;
  }
  async function* snapshotGroups() {
    const snapshot: GroupPricingInput[] = JSON.parse(await readFile(resolve(inputPath!), "utf8"));
    yield* snapshot;
  }
  const result = await runGroupPricingBackfill({ groups: inputPath ? snapshotGroups() : databaseGroups(), apply, applyGroup });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/backfill-group-pricing.ts")) {
  groupPricingBackfillMain(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : "Inisialisasi harga grup gagal.");
    process.exitCode = 1;
  });
}
