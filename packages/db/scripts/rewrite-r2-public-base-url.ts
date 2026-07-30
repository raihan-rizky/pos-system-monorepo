import { Prisma, db } from "../src/index";
import {
  parseR2PublicUrlMigrationOptions,
  runR2PublicUrlMigration,
  type R2PublicUrlMigrationRepository,
} from "./r2-public-url-migration-core";

type MigrationClient = Pick<
  Prisma.TransactionClient,
  "product" | "$executeRaw"
>;

function createRepository(
  client: MigrationClient,
): R2PublicUrlMigrationRepository {
  return {
    countByPrefix(prefix) {
      return client.product.count({
        where: { imageUrl: { startsWith: prefix } },
      });
    },
    async sampleByPrefix(prefix, limit) {
      const rows = await client.product.findMany({
        where: { imageUrl: { startsWith: prefix } },
        select: { id: true, name: true, imageUrl: true },
        orderBy: { id: "asc" },
        take: limit,
      });
      return rows.flatMap((row) =>
        row.imageUrl === null
          ? []
          : [{ id: row.id, name: row.name, imageUrl: row.imageUrl }],
      );
    },
    replacePrefix(fromPrefix, toPrefix) {
      const suffixStart = fromPrefix.length + 1;
      return client.$executeRaw(
        Prisma.sql`
          UPDATE "pos_products"
          SET "imageUrl" = ${toPrefix} || substring("imageUrl" FROM ${suffixStart})
          WHERE left("imageUrl", ${fromPrefix.length}) = ${fromPrefix}
        `,
      );
    },
  };
}

async function main() {
  const options = parseR2PublicUrlMigrationOptions(process.argv.slice(2));
  const result = options.apply
    ? await db.$transaction(
        (transaction) =>
          runR2PublicUrlMigration(options, createRepository(transaction)),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          timeout: 30_000,
        },
      )
    : await runR2PublicUrlMigration(options, createRepository(db));

  console.log(JSON.stringify(result, null, 2));
  if (!options.apply) {
    console.log(
      `Dry-run selesai. Jalankan ulang dengan --apply --expected-count=${result.matched} untuk menerapkan perubahan.`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
