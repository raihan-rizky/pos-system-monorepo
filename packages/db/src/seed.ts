import { PrismaClient } from "@prisma/client";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

declare const process: {
  cwd(): string;
  env: {
    NODE_ENV?: string;
    ALLOW_PRODUCTION_SEED?: string;
    DATABASE_URL?: string;
    DIRECT_URL?: string;
    SEED_DATABASE_URL?: string;
    [key: string]: string | undefined;
  };
  exit(code?: number): never;
};

function parseEnvValue(value: string) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function loadEnvFile(path: string, overrideExisting = false) {
  if (!existsSync(path)) {
    return;
  }

  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = line.match(
      /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/,
    );

    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;

    if (!overrideExisting && process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = parseEnvValue(rawValue);
  }
}

function normalizePooledPostgresUrl(url: string) {
  try {
    const parsedUrl = new URL(url);

    if (!parsedUrl.protocol.startsWith("postgres")) {
      return url;
    }

    if (
      parsedUrl.port === "6543" &&
      !parsedUrl.searchParams.has("pgbouncer")
    ) {
      parsedUrl.searchParams.set("pgbouncer", "true");
    }

    if (
      parsedUrl.port === "6543" &&
      !parsedUrl.searchParams.has("connection_limit")
    ) {
      parsedUrl.searchParams.set("connection_limit", "1");
    }

    return parsedUrl.toString();
  } catch {
    return url;
  }
}

loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));

const seedDatasourceUrl =
  process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL ?? process.env.DIRECT_URL;

if (!seedDatasourceUrl) {
  throw new Error(
    "SEED_DATABASE_URL, DATABASE_URL, or DIRECT_URL must be set before seeding.",
  );
}

const prisma = new PrismaClient({
  datasourceUrl: normalizePooledPostgresUrl(seedDatasourceUrl),
});

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
  console.log(`  Store: ${store.name}`);

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
    `  Users: ${owner.name}, ${admin.name}, ${cashier.name}, ${sales.name}`,
  );

  // ============================================================
  // Create Categories
  // ============================================================
  const categoryUpserts = [
    () => prisma.category.upsert({
      where: { name: "ATK" },
      update: { icon: "pen-tool" },
      create: { name: "ATK", icon: "pen-tool", color: "#3b82f6", order: 1 },
    }),
    () => prisma.category.upsert({
      where: { name: "Bot" },
      update: { icon: "package" },
      create: { name: "Bot", icon: "package", color: "#22c55e", order: 2 },
    }),
    () => prisma.category.upsert({
      where: { name: "Plano" },
      update: { icon: "file-text" },
      create: { name: "Plano", icon: "file-text", color: "#a855f7", order: 3 },
    }),
    () => prisma.category.upsert({
      where: { name: "Catridge HP" },
      update: { icon: "printer" },
      create: { name: "Catridge HP", icon: "printer", color: "#f97316", order: 4 },
    }),
    () => prisma.category.upsert({
      where: { name: "Catridge Canon" },
      update: { icon: "printer" },
      create: {
        name: "Catridge Canon",
        icon: "printer",
        color: "#ef4444",
        order: 5,
      },
    }),
    () => prisma.category.upsert({
      where: { name: "Cetakan" },
      update: { icon: "image" },
      create: { name: "Cetakan", icon: "image", color: "#eab308", order: 6 },
    }),
    () => prisma.category.upsert({
      where: { name: "FC" },
      update: { icon: "file-text" },
      create: { name: "FC", icon: "file-text", color: "#64748b", order: 7 },
    }),
    () => prisma.category.upsert({
      where: { name: "Stamp" },
      update: { icon: "stamp" },
      create: { name: "Stamp", icon: "stamp", color: "#06b6d4", order: 8 },
    }),
    () => prisma.category.upsert({
      where: { name: "Sparepart Fc" },
      update: { icon: "settings" },
      create: { name: "Sparepart Fc", icon: "settings", color: "#64748b", order: 9 },
    }),
    () => prisma.category.upsert({
      where: { name: "MNM" },
      update: { icon: "package" },
      create: { name: "MNM", icon: "package", color: "#3b82f6", order: 10 },
    }),
    () => prisma.category.upsert({
      where: { name: "Id Card" },
      update: { icon: "id-card" },
      create: { name: "Id Card", icon: "id-card", color: "#10b981", order: 11 },
    }),
    () => prisma.category.upsert({
      where: { name: "Toner HP" },
      update: { icon: "printer" },
      create: { name: "Toner HP", icon: "printer", color: "#f97316", order: 12 },
    }),
    () => prisma.category.upsert({
      where: { name: "Toner DP" },
      update: { icon: "printer" },
      create: { name: "Toner DP", icon: "printer", color: "#8b5cf6", order: 13 },
    }),
    () => prisma.category.upsert({
      where: { name: "Toner E print" },
      update: { icon: "printer" },
      create: { name: "Toner E print", icon: "printer", color: "#ec4899", order: 14 },
    }),
    () => prisma.category.upsert({
      where: { name: "Cardridge Canon" },
      update: { icon: "printer" },
      create: { name: "Cardridge Canon", icon: "printer", color: "#ef4444", order: 15 },
    }),
    () => prisma.category.upsert({
      where: { name: "Tinta" },
      update: { icon: "droplets" },
      create: { name: "Tinta", icon: "droplets", color: "#0ea5e9", order: 16 },
    }),
    () => prisma.category.upsert({
      where: { name: "Tinta Printing" },
      update: { icon: "droplets" },
      create: { name: "Tinta Printing", icon: "droplets", color: "#2563eb", order: 17 },
    }),
    () => prisma.category.upsert({
      where: { name: "Kertas" },
      update: { icon: "file-text" },
      create: { name: "Kertas", icon: "file-text", color: "#f59e0b", order: 18 },
    }),
    () => prisma.category.upsert({
      where: { name: "PRNT" },
      update: { icon: "printer" },
      create: { name: "PRNT", icon: "printer", color: "#64748b", order: 19 },
    }),
    () => prisma.category.upsert({
      where: { name: "Catridge M.TIK" },
      update: { icon: "printer" },
      create: { name: "Catridge M.TIK", icon: "printer", color: "#8b5cf6", order: 20 },
    }),
    () => prisma.category.upsert({
      where: { name: "Cartridge" },
      update: { icon: "printer" },
      create: { name: "Cartridge", icon: "printer", color: "#64748b", order: 21 },
    }),
    () => prisma.category.upsert({
      where: { name: "PLAT" },
      update: { icon: "disc" },
      create: { name: "PLAT", icon: "disc", color: "#94a3b8", order: 22 },
    }),
    () => prisma.category.upsert({
      where: { name: "JLD" },
      update: { icon: "package" },
      create: { name: "JLD", icon: "package", color: "#06b6d4", order: 23 },
    }),
    () => prisma.category.upsert({
      where: { name: "SP" },
      update: { icon: "package" },
      create: { name: "SP", icon: "package", color: "#8b5cf6", order: 24 },
    }),
    () => prisma.category.upsert({
      where: { name: "AYK" },
      update: { icon: "package" },
      create: { name: "AYK", icon: "package", color: "#10b981", order: 25 },
    }),
  ];

  for (const upsertCategory of categoryUpserts) {
    await upsertCategory();
  }

  console.log(`  Categories: ${categoryUpserts.length} created`);

  // ============================================================
  // Create Products
  // ============================================================
  // Products will be uploaded via batch later

  console.log("\n🎉 Seed completed successfully!");
}

main()
  .catch((e: unknown) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
