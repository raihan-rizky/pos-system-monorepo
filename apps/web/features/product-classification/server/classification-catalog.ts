import { db } from "@pos/db";
import { z } from "zod";
import { validateCatalogSubcategory } from "../helpers/classification";

export class ClassificationCatalogError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ClassificationCatalogError";
  }
}

const id = z.string().trim().min(1).max(200);
const name = z.string().trim().min(1).max(150);
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), name }).strict(),
  z.object({ action: z.literal("update"), id, name }).strict(),
  z.object({ action: z.literal("delete"), id }).strict(),
]);

export async function manageClassificationSubcategory(raw: unknown) {
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) throw new ClassificationCatalogError(422, "Periksa kembali nama subkategori.");
  const input = parsed.data;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('product-classification-catalog', 0))::text`;
    const existing = await tx.productSubcategory.findMany({
      select: { id: true, group: true, name: true, legacyCategoryId: true },
    });
    const current = input.action === "create" ? null : existing.find((row) => row.id === input.id);
    if (input.action !== "create" && !current) throw new ClassificationCatalogError(404, "Subkategori tidak ditemukan.");
    if (current && current.group !== "ATK") throw new ClassificationCatalogError(403, "Subkategori percetakan sudah ditetapkan dan tidak dapat diubah.");
    if (input.action === "delete") {
      const productCount = await tx.product.count({ where: { catalogSubcategoryId: input.id } });
      if (productCount) throw new ClassificationCatalogError(409, "Subkategori masih digunakan produk. Pindahkan produknya terlebih dahulu.");
      const pricingRuleCount = await tx.subcategoryCustomerPricingRule.count({ where: { subcategoryId: input.id } });
      if (pricingRuleCount) throw new ClassificationCatalogError(409, "Subkategori masih memiliki aturan harga, termasuk aturan yang tidak aktif, sehingga belum dapat dihapus.");
      await tx.productSubcategory.delete({ where: { id: input.id } });
      return { id: input.id, deleted: true };
    }
    const validation = validateCatalogSubcategory({ group: "ATK", name: input.name }, existing, current?.id);
    if (!validation.valid) throw new ClassificationCatalogError(409, "Nama subkategori sudah digunakan. Pilih nama lain.");
    return input.action === "create"
      ? tx.productSubcategory.create({ data: { group: "ATK", name: input.name } })
      : tx.productSubcategory.update({ where: { id: input.id }, data: { name: input.name } });
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
}
