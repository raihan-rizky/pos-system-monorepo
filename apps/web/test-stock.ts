import { db } from "@pos/db";
import { resolveProductDisplayStock } from "@/features/product-stock-groups/stock-display";

async function main() {
  const products = await db.product.findMany({
    where: { name: { contains: "Amplop 104 Garda" } },
    include: { stockGroup: true },
  });

  for (const product of products) {
    console.log(product.name, product.unit, "stock:", product.stock, "baseStock:", product.stockGroup?.baseStock, "displayStock:", resolveProductDisplayStock(product));
  }
}

main().catch(console.error).finally(() => db.$disconnect());
