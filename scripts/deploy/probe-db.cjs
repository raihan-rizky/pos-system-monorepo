const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { join } = require('node:path');

async function fingerprintDatabase(db) {
  const columns = await db.$queryRawUnsafe("SELECT c.relname::text AS table_name,a.attname::text AS column_name,format_type(a.atttypid,a.atttypmod) AS formatted_type,a.attnotnull,a.attidentity::text,a.attgenerated::text,pg_get_expr(d.adbin,d.adrelid) AS default_expression,a.attcollation::regcollation::text AS collation FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum");
  const constraints = await db.$queryRawUnsafe("SELECT COALESCE(c.relname,t.typname)::text AS owner,con.conname::text,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con LEFT JOIN pg_class c ON c.oid=con.conrelid LEFT JOIN pg_type t ON t.oid=con.contypid JOIN pg_namespace n ON n.oid=con.connamespace WHERE n.nspname='public' ORDER BY owner,con.conname");
  const enums = await db.$queryRawUnsafe("SELECT t.typname::text,e.enumsortorder::text AS position,e.enumlabel::text FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder");
  const domains = await db.$queryRawUnsafe("SELECT t.typname::text,format_type(t.typbasetype,t.typtypmod) AS base_type,t.typnotnull,t.typdefault FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='d' ORDER BY t.typname");
  return createHash('sha256').update(JSON.stringify({ columns, constraints, enums, domains })).digest('hex');
}

async function main() {
  const load = createRequire(join(process.argv[2], 'packages/db/package.json'));
  const { PrismaClient } = load('@prisma/client');
  const db = new PrismaClient({ log: [] });
  try {
    process.stdout.write(await fingerprintDatabase(db));
  } finally {
    await db.$disconnect();
  }
}

module.exports = { fingerprintDatabase };
if (require.main === module) main().catch(() => { process.stderr.write('Database probe gagal\n'); process.exitCode = 1; });
