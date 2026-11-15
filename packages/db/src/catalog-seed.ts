import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

type CatalogGroup = "ATK" | "PERCETAKAN";
type LegacyCategory = { id: string; name: string };
type ExistingSubcategory = {
  id: string;
  group: CatalogGroup;
  name: string;
  legacyCategoryId: string | null;
  productCount: number;
};
type NewSubcategory = Omit<ExistingSubcategory, "productCount">;

const normalize = (name: string) => name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");

export function planCatalogSeed(
  categories: readonly LegacyCategory[],
  existing: readonly ExistingSubcategory[],
): { creates: NewSubcategory[]; links: { subcategoryId: string; legacyCategoryId: string }[] } {
  const rows = existing.map((row) => ({ ...row }));
  const creates: NewSubcategory[] = [];
  const links: { subcategoryId: string; legacyCategoryId: string }[] = [];

  for (const category of categories) {
    if (rows.some((row) => row.legacyCategoryId === category.id)) continue;
    const unused = rows.find((row) => row.group === "ATK" && !row.legacyCategoryId &&
      row.productCount === 0 && normalize(row.name) === normalize(category.name));
    if (unused) {
      unused.legacyCategoryId = category.id;
      links.push({ subcategoryId: unused.id, legacyCategoryId: category.id });
      continue;
    }

    let name = category.name;
    let suffix = 1;
    while (rows.some((row) => row.group === "ATK" && row.name === name)) {
      name = `${category.name} (kategori lama${suffix === 1 ? "" : ` ${suffix}`})`;
      suffix += 1;
    }
    const row: NewSubcategory = {
      id: `catalog_legacy_${createHash("md5").update(category.id).digest("hex")}`,
      group: "ATK",
      name,
      legacyCategoryId: category.id,
    };
    creates.push(row);
    rows.push({ ...row, productCount: 0 });
  }

  const defaults: NewSubcategory[] = [
    { id: "catalog_atk_cartridge", group: "ATK", name: "Cartridge", legacyCategoryId: null },
    { id: "catalog_printing_print", group: "PERCETAKAN", name: "PRINT", legacyCategoryId: null },
    { id: "catalog_printing_stempel", group: "PERCETAKAN", name: "STEMPEL", legacyCategoryId: null },
    { id: "catalog_printing_plat", group: "PERCETAKAN", name: "PLAT", legacyCategoryId: null },
  ];
  for (const row of defaults) {
    if (!rows.some((existingRow) => existingRow.group === row.group && normalize(existingRow.name) === normalize(row.name))) {
      creates.push(row);
      rows.push({ ...row, productCount: 0 });
    }
  }
  return { creates, links };
}

export async function seedProductSubcategories(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const categories = await tx.category.findMany({ select: { id: true, name: true }, orderBy: { id: "asc" } });
    const existing = await tx.productSubcategory.findMany({
      select: { id: true, group: true, name: true, legacyCategoryId: true, _count: { select: { products: true } } },
    });
    const plan = planCatalogSeed(categories, existing.map(({ _count, ...row }) => ({ ...row, productCount: _count.products })));
    for (const link of plan.links) {
      const result = await tx.productSubcategory.updateMany({
        where: { id: link.subcategoryId, legacyCategoryId: null, products: { none: {} } },
        data: { legacyCategoryId: link.legacyCategoryId },
      });
      if (result.count !== 1) throw new Error("Subkategori berubah saat seed. Jalankan kembali seed.");
    }
    for (const row of plan.creates) await tx.productSubcategory.create({ data: row });
  }, { isolationLevel: "Serializable" });
}
