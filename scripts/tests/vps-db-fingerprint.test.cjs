const test = require('node:test');
const assert = require('node:assert/strict');
const probe = require('../deploy/probe-db.cjs');

function fakeDatabase(scale, labels) {
  return { async $queryRawUnsafe(sql) {
    if (sql.includes('format_type') && sql.includes('pg_attribute')) return [{ type: `numeric(12,${scale})` }];
    if (sql.includes('information_schema.columns')) return [{ data_type: 'numeric' }];
    if (sql.includes('pg_enum')) return labels.map(label => ({ label }));
    return [];
  } };
}

test('fingerprint distinguishes numeric typmods', async () => {
  assert.equal(typeof probe.fingerprintDatabase, 'function');
  assert.notEqual(await probe.fingerprintDatabase(fakeDatabase(2, ['a'])), await probe.fingerprintDatabase(fakeDatabase(0, ['a'])));
});

test('fingerprint distinguishes enum definitions', async () => {
  assert.equal(typeof probe.fingerprintDatabase, 'function');
  assert.notEqual(await probe.fingerprintDatabase(fakeDatabase(2, ['a'])), await probe.fingerprintDatabase(fakeDatabase(2, ['a', 'b'])));
});

test('isolated Postgres confirms numeric scale and enum changes', { skip: process.env.POS_CI_DATABASE_TEST !== '1' }, async () => {
  assert.equal(process.env.CI, 'true');
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
  assert.equal(url.pathname, '/pos_ci');
  const { createRequire } = require('node:module');
  const { resolve } = require('node:path');
  const { PrismaClient } = createRequire(resolve(__dirname, '../../packages/db/package.json'))('@prisma/client');
  const db = new PrismaClient({ log: [] });
  try {
    await db.$executeRawUnsafe('CREATE TABLE public.__ci_fingerprint_money (amount numeric(12,2))');
    const initial = await probe.fingerprintDatabase(db);
    await db.$executeRawUnsafe('ALTER TABLE public.__ci_fingerprint_money ALTER COLUMN amount TYPE numeric(12,0)');
    assert.notEqual(await probe.fingerprintDatabase(db), initial);
    await db.$executeRawUnsafe("CREATE TYPE public.__ci_fingerprint_status AS ENUM ('a')");
    const beforeEnum = await probe.fingerprintDatabase(db);
    await db.$executeRawUnsafe("ALTER TYPE public.__ci_fingerprint_status ADD VALUE 'b'");
    assert.notEqual(await probe.fingerprintDatabase(db), beforeEnum);
  } finally {
    await db.$executeRawUnsafe('DROP TABLE IF EXISTS public.__ci_fingerprint_money');
    await db.$executeRawUnsafe('DROP TYPE IF EXISTS public.__ci_fingerprint_status');
    await db.$disconnect();
  }
});
