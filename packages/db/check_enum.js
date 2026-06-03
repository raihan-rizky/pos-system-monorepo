const { PrismaClient } = require('@prisma/client'); 
const prisma = new PrismaClient(); 

async function main() { 
  const res = await prisma.$queryRaw`SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid WHERE pg_type.typname = 'CategoryCustomerPricingMode'`;
  console.log(res); 
} 

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
