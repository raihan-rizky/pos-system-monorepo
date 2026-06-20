const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'postgresql://postgres:raihanrizki1@db.pjgkfajkunbpwiyovtnc.supabase.co:5432/postgres'
    }
  }
});

async function run() {
  try {
    const res = await prisma.$executeRawUnsafe(`
      SELECT pg_terminate_backend(pid) 
      FROM pg_stat_activity 
      WHERE datname = current_database() 
        AND pid <> pg_backend_pid()
        AND usename = current_user;
    `);
    console.log('Terminated connections:', res);
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
