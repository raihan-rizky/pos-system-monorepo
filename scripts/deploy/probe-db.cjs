const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { join } = require('node:path');

async function main() {
  const load = createRequire(join(process.argv[2], 'packages/db/package.json'));
  const { PrismaClient } = load('@prisma/client');
  const db = new PrismaClient({ log: [] });
  try {
    const columns = await db.$queryRawUnsafe("SELECT table_name,column_name,data_type,is_nullable,udt_name,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position");
    const constraints = await db.$queryRawUnsafe("SELECT c.relname AS table_name,con.conname,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,con.conname");
    process.stdout.write(createHash('sha256').update(JSON.stringify({ columns, constraints })).digest('hex'));
  } finally {
    await db.$disconnect();
  }
}

main().catch(() => { process.stderr.write('Database probe gagal\n'); process.exitCode = 1; });
