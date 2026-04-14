import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
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
  // Create Users
  // ============================================================
  const owner = await prisma.user.upsert({
    where: { email: "owner@posshop.com" },
    update: {},
    create: {
      email: "owner@posshop.com",
      name: "Pemilik Toko",
      role: "OWNER",
      pin: "1234",
      storeId: store.id,
    },
  });

  const cashier = await prisma.user.upsert({
    where: { email: "kasir1@posshop.com" },
    update: {},
    create: {
      email: "kasir1@posshop.com",
      name: "Kasir 1",
      role: "CASHIER",
      pin: "5678",
      storeId: store.id,
    },
  });
  console.log(`  ✅ Users: ${owner.name}, ${cashier.name}`);

  // ============================================================
  // Create Categories
  // ============================================================
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { name: "Alat Tulis" },
      update: {},
      create: { name: "Alat Tulis", icon: "✏️", color: "#3b82f6", order: 1 },
    }),
    prisma.category.upsert({
      where: { name: "Kertas" },
      update: {},
      create: { name: "Kertas", icon: "📄", color: "#22c55e", order: 2 },
    }),
    prisma.category.upsert({
      where: { name: "Tinta & Cartridge" },
      update: {},
      create: { name: "Tinta & Cartridge", icon: "🖨️", color: "#a855f7", order: 3 },
    }),
    prisma.category.upsert({
      where: { name: "Jasa Cetak" },
      update: {},
      create: { name: "Jasa Cetak", icon: "🖼️", color: "#f97316", order: 4 },
    }),
    prisma.category.upsert({
      where: { name: "Amplop & Map" },
      update: {},
      create: { name: "Amplop & Map", icon: "📁", color: "#eab308", order: 5 },
    }),
    prisma.category.upsert({
      where: { name: "Perlengkapan Kantor" },
      update: {},
      create: { name: "Perlengkapan Kantor", icon: "🏢", color: "#64748b", order: 6 },
    }),
  ]);
  console.log(`  ✅ Categories: ${categories.length} created`);

  // ============================================================
  // Create Products
  // ============================================================
  const products = [
    // Alat Tulis
    { name: "Pulpen Pilot G2", sku: "ATU-001", price: 15000, costPrice: 10000, stock: 100, unit: "pcs", categoryId: categories[0].id, imageUrl: "/images/pulpen-pilot-g2.png" },
    { name: "Pensil 2B Faber Castell", sku: "ATU-002", price: 5000, costPrice: 3000, stock: 200, unit: "pcs", categoryId: categories[0].id, imageUrl: "/images/pensil-2b-faber-castle.png" },
    { name: "Penghapus Staedtler", sku: "ATU-003", price: 4000, costPrice: 2500, stock: 150, unit: "pcs", categoryId: categories[0].id, imageUrl: "/images/stip-pensil-besar-staedtler.png" },
    { name: "Spidol Snowman", sku: "ATU-004", price: 8000, costPrice: 5000, stock: 80, unit: "pcs", categoryId: categories[0].id, imageUrl: "/images/spidol-permanen-g12-snowman.png" },
    { name: "Stabilo Boss Highlighter", sku: "ATU-005", price: 18000, costPrice: 12000, stock: 60, unit: "pcs", categoryId: categories[0].id, imageUrl: "/images/STABILO-BOSS-ORIGINAL-HIGHLIGHTER.png" },

    // Kertas
    { name: "Kertas HVS A4 70gsm (1 Rim)", sku: "KRT-001", price: 55000, costPrice: 42000, stock: 50, unit: "rim", categoryId: categories[1].id, imageUrl: "/images/kertas.png" },
    { name: "Kertas HVS A4 80gsm (1 Rim)", sku: "KRT-002", price: 65000, costPrice: 50000, stock: 40, unit: "rim", categoryId: categories[1].id, imageUrl: "/images/kertas.png" },
    { name: "Kertas F4 70gsm (1 Rim)", sku: "KRT-003", price: 58000, costPrice: 44000, stock: 35, unit: "rim", categoryId: categories[1].id, imageUrl: "/images/kertas.png" },
    { name: "Kertas Foto Glossy A4 (20 Lembar)", sku: "KRT-004", price: 35000, costPrice: 22000, stock: 25, unit: "pack", categoryId: categories[1].id, imageUrl: "/images/kertas.png" },
    { name: "Kertas Art Paper 120gsm A4", sku: "KRT-005", price: 1500, costPrice: 800, stock: 500, unit: "lembar", categoryId: categories[1].id, imageUrl: "/images/kertas.png" },

    // Tinta & Cartridge
    { name: "Tinta Epson 003 Black", sku: "TNT-001", price: 85000, costPrice: 65000, stock: 20, unit: "pcs", categoryId: categories[2].id, imageUrl: "/images/tinta-epson.png" },
    { name: "Tinta Epson 003 Cyan", sku: "TNT-002", price: 85000, costPrice: 65000, stock: 15, unit: "pcs", categoryId: categories[2].id, imageUrl: "/images/tinta-epson.png" },
    { name: "Tinta Epson 003 Magenta", sku: "TNT-003", price: 85000, costPrice: 65000, stock: 15, unit: "pcs", categoryId: categories[2].id, imageUrl: "/images/tinta-epson.png" },
    { name: "Tinta Epson 003 Yellow", sku: "TNT-004", price: 85000, costPrice: 65000, stock: 15, unit: "pcs", categoryId: categories[2].id, imageUrl: "/images/tinta-epson.png" },

    // Jasa Cetak
    { name: "Print Hitam Putih A4", sku: "JCT-001", size: "A4", material: "HVS 70gsm", price: 500, costPrice: 200, stock: 9999, unit: "lembar", categoryId: categories[3].id, imageUrl: "/images/print-hitam-putih.png" },
    { name: "Print Warna A4", sku: "JCT-002", size: "A4", material: "HVS 80gsm", price: 1500, costPrice: 600, stock: 9999, unit: "lembar", categoryId: categories[3].id, imageUrl: "/images/print-warna.png" },
    { name: "Fotokopi A4", sku: "JCT-003", size: "A4", material: "HVS 70gsm", price: 300, costPrice: 100, stock: 9999, unit: "lembar", categoryId: categories[3].id, imageUrl: "/images/fotocopy.png" },
    { name: "Cetak Foto 4R", sku: "JCT-004", size: "4R", material: "Glossy Paper", price: 5000, costPrice: 2000, stock: 9999, unit: "lembar", categoryId: categories[3].id, imageUrl: "/images/cetak-foto.png" },
    { name: "Laminating A4", sku: "JCT-005", size: "A4", material: "Plastik 100mic", price: 5000, costPrice: 2000, stock: 9999, unit: "lembar", categoryId: categories[3].id, imageUrl: "/images/laminating.png" },
    { name: "Spanduk Flexi 280gr", sku: "JCT-006", size: "3x2m", material: "Flexi 280gr", price: 100000, costPrice: 80000, stock: 9999, unit: "pcs", categoryId: categories[3].id, imageUrl: "/images/all-banner.png" },
    { name: "Spanduk Flexi 340gr", sku: "JCT-007", size: "2x1m", material: "Flexi 340gr", price: 50000, costPrice: 40000, stock: 9999, unit: "pcs", categoryId: categories[3].id, imageUrl: "/images/all-banner.png" },

    // Amplop & Map
    { name: "Amplop Putih Polos", sku: "AMP-001", price: 500, costPrice: 300, stock: 500, unit: "pcs", categoryId: categories[4].id, imageUrl: "/images/amplop-putih-polos.png" },
    { name: "Amplop Coklat Besar", sku: "AMP-002", price: 2000, costPrice: 1200, stock: 200, unit: "pcs", categoryId: categories[4].id, imageUrl: "/images/amplop-coklat-besar.png" },
    { name: "Map Plastik Kancing", sku: "AMP-003", price: 5000, costPrice: 3000, stock: 100, unit: "pcs", categoryId: categories[4].id, imageUrl: "/images/map-plastik-kancing.png" },

    // Perlengkapan Kantor
    { name: "Stapler Kangaro HS-10H", sku: "PKT-001", price: 25000, costPrice: 16000, stock: 30, unit: "pcs", categoryId: categories[5].id, imageUrl: "/images/kangaro-stapler-no-stapler-kangaro.png" },
    { name: "Isi Staples No.10", sku: "PKT-002", price: 5000, costPrice: 3000, stock: 100, unit: "box", categoryId: categories[5].id, imageUrl: "/images/isi-staples-no10.png" },
    { name: "Gunting Joyko", sku: "PKT-003", price: 15000, costPrice: 9000, stock: 40, unit: "pcs", categoryId: categories[5].id, imageUrl: "/images/gunting-joyko.png" },
    { name: "Selotip Bening", sku: "PKT-004", price: 8000, costPrice: 5000, stock: 60, unit: "roll", categoryId: categories[5].id, imageUrl: "/images/selotip-bening.png" },
  ];

  for (const product of products) {
    await prisma.product.upsert({
      where: { sku: product.sku },
      update: {
        name: product.name,
        price: product.price,
        costPrice: product.costPrice,
        size: product.size || null,
        material: product.material || null,
        imageUrl: product.imageUrl || null,
      },
      create: {
        ...product,
        storeId: store.id,
      },
    });
  }
  console.log(`  ✅ Products: ${products.length} created`);

  console.log("\n🎉 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
