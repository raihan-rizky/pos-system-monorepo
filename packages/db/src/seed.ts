import { PrismaClient } from "@prisma/client";

declare const process: {
  env: {
    NODE_ENV?: string;
    ALLOW_PRODUCTION_SEED?: string;
  };
  exit(code?: number): never;
};

const prisma = new PrismaClient();

async function main() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PRODUCTION_SEED !== "true"
  ) {
    throw new Error(
      "Refusing to seed in production. Set ALLOW_PRODUCTION_SEED=true only for an intentional one-off seed.",
    );
  }

  console.log("🌱 Seeding POS database...");

  // ============================================================
  // Create Store
  // ============================================================
  const store = await prisma.store.upsert({
    where: { id: "store-main" },
    update: {},
    create: {
      id: "store-main",
      name: "Toko Percetakan & ATK Utama",
      address: "Jl. Merdeka No. 123, Jakarta",
      phone: "021-12345678",
    },
  });
  console.log(`  ✅ Store: ${store.name}`);

  // ============================================================
  // Create Users (all 4 roles for testing)
  // ============================================================
  const owner = await prisma.user.upsert({
    where: { username: "owner" },
    update: { role: "OWNER" },
    create: {
      username: "owner",
      name: "Pemilik Toko",
      role: "OWNER",
      password: "owner123",
      storeId: store.id,
    },
  });

  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: { role: "ADMIN" },
    create: {
      username: "admin",
      name: "Admin Toko",
      role: "ADMIN",
      password: "admin123",
      storeId: store.id,
    },
  });

  const cashier = await prisma.user.upsert({
    where: { username: "kasir1" },
    update: { role: "CASHIER" },
    create: {
      username: "kasir1",
      name: "Kasir 1",
      role: "CASHIER",
      password: "kasir123",
      storeId: store.id,
    },
  });

  const sales = await prisma.user.upsert({
    where: { username: "sales1" },
    update: { role: "SALES" },
    create: {
      username: "sales1",
      name: "Sales 1",
      role: "SALES",
      password: "sales123",
      storeId: store.id,
    },
  });

  console.log(
    `  ✅ Users: ${owner.name}, ${admin.name}, ${cashier.name}, ${sales.name}`,
  );

  // ============================================================
  // Create Categories
  // ============================================================
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { name: "ATK" },
      update: {},
      create: { name: "ATK", icon: "✏️", color: "#3b82f6", order: 1 },
    }),
    prisma.category.upsert({
      where: { name: "Bot" },
      update: {},
      create: { name: "Bot", icon: "🍾", color: "#22c55e", order: 2 },
    }),
    prisma.category.upsert({
      where: { name: "Plano" },
      update: {},
      create: { name: "Plano", icon: "📄", color: "#a855f7", order: 3 },
    }),
    prisma.category.upsert({
      where: { name: "Catridge HP" },
      update: {},
      create: { name: "Catridge HP", icon: "🖨️", color: "#f97316", order: 4 },
    }),
    prisma.category.upsert({
      where: { name: "Catridge Canon" },
      update: {},
      create: {
        name: "Catridge Canon",
        icon: "🖨️",
        color: "#ef4444",
        order: 5,
      },
    }),
    prisma.category.upsert({
      where: { name: "Cetakan" },
      update: {},
      create: { name: "Cetakan", icon: "🖼️", color: "#eab308", order: 6 },
    }),
    prisma.category.upsert({
      where: { name: "FC" },
      update: {},
      create: { name: "FC", icon: "📄", color: "#64748b", order: 7 },
    }),
    prisma.category.upsert({
      where: { name: "Stamp" },
      update: {},
      create: { name: "Stamp", icon: "💮", color: "#06b6d4", order: 8 },
    }),
  ]);
  console.log(`  ✅ Categories: ${categories.length} created`);

  // ============================================================
  // Create Products
  // ============================================================
  // Products will be uploaded via batch later

  console.log("\n🎉 Seed completed successfully!");
}

main()
  .catch((e: unknown) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
