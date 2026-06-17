import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const apply = process.argv.includes("--apply");

type RepairCandidate = {
  groupId: string;
  displayName: string;
  currentBaseUnit: string;
  nextBaseUnit: string;
  reason: string;
};

type SkippedGroup = {
  groupId: string;
  displayName: string;
  currentBaseUnit: string;
  reason: string;
};

async function main() {
  const groups = await prisma.productStockGroup.findMany({
    include: {
      products: {
        where: { isActive: true },
        select: {
          id: true,
          sku: true,
          unit: true,
          unitMultiplierToBase: true,
        },
      },
    },
    orderBy: { displayName: "asc" },
  });

  const candidates: RepairCandidate[] = [];
  const skipped: SkippedGroup[] = [];

  for (const group of groups) {
    if (group.products.length < 2) continue;

    const baseUnit = group.baseUnit.trim().toLowerCase();
    const corruptBaseProduct = group.products.find(
      (product) =>
        product.unit.trim().toLowerCase() === baseUnit &&
        product.unitMultiplierToBase > 1,
    );
    if (!corruptBaseProduct) continue;

    const clearBaseProducts = group.products.filter(
      (product) => product.unitMultiplierToBase === 1,
    );

    if (clearBaseProducts.length !== 1) {
      skipped.push({
        groupId: group.id,
        displayName: group.displayName,
        currentBaseUnit: group.baseUnit,
        reason: `Expected exactly one multiplier=1 product, found ${clearBaseProducts.length}`,
      });
      continue;
    }

    candidates.push({
      groupId: group.id,
      displayName: group.displayName,
      currentBaseUnit: group.baseUnit,
      nextBaseUnit: clearBaseProducts[0].unit,
      reason: `${corruptBaseProduct.sku} uses multiplier ${corruptBaseProduct.unitMultiplierToBase}`,
    });
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        repairCount: candidates.length,
        skippedCount: skipped.length,
        repairs: candidates,
        skipped,
      },
      null,
      2,
    ),
  );

  if (!apply || candidates.length === 0) return;

  await prisma.$transaction(
    candidates.map((candidate) =>
      prisma.productStockGroup.update({
        where: { id: candidate.groupId },
        data: { baseUnit: candidate.nextBaseUnit },
      }),
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

