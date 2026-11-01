import { describe, expect, it } from 'vitest';
import { Prisma } from '@pos/db';

describe('inventory month closure Prisma model', () => {
  it('maps both timestamps and the cutoff primary key to the closure table', () => {
    const model = Prisma.dmmf.datamodel.models.find(entry => entry.dbName === 'pos_inventory_valuation_v2_closures');
    expect(model?.fields).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'cutoff', type: 'DateTime', isId: true, isRequired: true }),
      expect.objectContaining({ name: 'closedAt', type: 'DateTime', isRequired: true }),
    ]));
  });
});
