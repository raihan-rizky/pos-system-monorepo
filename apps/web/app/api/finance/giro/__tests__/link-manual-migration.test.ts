import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const file = path.resolve(process.cwd(), '../../packages/db/prisma/migrations/20261102100000_manual_giro_link_audit/migration.sql');

describe('manual giro link audit migration', () => {
  it('keeps full debt and payment snapshots and blocks Supabase API access', () => {
    const sql = readFileSync(file, 'utf8');
    for (const column of ['manualPayable', 'giroPayable', 'manualPayments', 'giroPayments', 'duplicatePayments', 'requestPayload']) {
      expect(sql).toContain(`"${column}" JSONB NOT NULL`);
    }
    expect(sql).toContain('REFERENCES "pos_supplier_payables"("id") ON DELETE RESTRICT');
    expect(sql).toContain('"giroPayableId" TEXT NOT NULL REFERENCES');
    expect(sql).toContain('CREATE INDEX "pos_supplier_payable_manual_links_giroPayableId_idx"');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('FROM PUBLIC');
    expect(sql).toContain("'anon', 'authenticated', 'service_role'");
  });
});
