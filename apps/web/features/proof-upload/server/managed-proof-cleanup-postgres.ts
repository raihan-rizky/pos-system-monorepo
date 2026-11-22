import { randomUUID } from "node:crypto";
import type { ManagedProofCleanupClaim, ManagedProofCleanupStore } from "./managed-proof-cleanup";

export type ManagedProofSqlClient = {
  $queryRaw<T>(parts: TemplateStringsArray, ...values: unknown[]): Promise<T>;
  $executeRaw(parts: TemplateStringsArray, ...values: unknown[]): Promise<number>;
};

export function createManagedProofCleanupStore(db: ManagedProofSqlClient): ManagedProofCleanupStore {
  return {
    async claim() {
      const leaseId = randomUUID();
      const claims = await db.$queryRaw<ManagedProofCleanupClaim[]>`
        WITH candidate AS (
          SELECT object."id"
          FROM "pos_managed_proof_objects" AS object
          JOIN "pos_managed_proof_cleanup_control" AS control ON control."singleton" = true
          WHERE control."enabled" = true AND object."state" = 'deleting'
            AND object."nextAttemptAt" <= clock_timestamp()
            AND (object."leaseUntil" IS NULL OR object."leaseUntil" <= clock_timestamp())
            AND NOT EXISTS (SELECT 1 FROM "pos_managed_proof_references" AS reference WHERE reference."objectId" = object."id")
          ORDER BY object."nextAttemptAt", object."id"
          FOR UPDATE OF object SKIP LOCKED LIMIT 1
        )
        UPDATE "pos_managed_proof_objects" AS object
        SET "leaseId" = ${leaseId}, "leaseUntil" = clock_timestamp() + interval '2 minutes',
            "attempts" = object."attempts" + 1, "updatedAt" = clock_timestamp()
        FROM candidate WHERE object."id" = candidate."id"
        RETURNING object."id", object."accountId", object."bucket", object."objectKey" AS "key", object."leaseId"
      `;
      return claims[0] ?? null;
    },
    async confirmDeleted(claim) {
      const count = await db.$executeRaw`
        UPDATE "pos_managed_proof_objects"
        SET "state" = 'deleted', "deletedAt" = clock_timestamp(), "updatedAt" = clock_timestamp(),
            "leaseId" = NULL, "leaseUntil" = NULL
        WHERE "id" = ${claim.id} AND "state" = 'deleting' AND "leaseId" = ${claim.leaseId}
      `;
      return count === 1;
    },
    async retry(claim) {
      const count = await db.$executeRaw`
        UPDATE "pos_managed_proof_objects"
        SET "nextAttemptAt" = clock_timestamp() + interval '1 minute', "updatedAt" = clock_timestamp(),
            "leaseId" = NULL, "leaseUntil" = NULL
        WHERE "id" = ${claim.id} AND "state" = 'deleting' AND "leaseId" = ${claim.leaseId}
      `;
      return count === 1;
    },
  };
}
