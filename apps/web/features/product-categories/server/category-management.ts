import { createHmac, timingSafeEqual } from "node:crypto";
import { db, type Prisma } from "@pos/db";
import { z } from "zod";
import { isCategoryIconName } from "@/lib/category-icon-catalog";
import { stockGroupKeyForCategory } from "@/features/product-stock-groups/group-category";
import { lockStockMutationRows } from "@/features/product-stock-groups/stock-group-lock";
import type { CategoryActionResult, DeletePreview, MovePreview, PricingRuleImpact } from "../types";

type Actor = { id: string; role: string; storeId: string | null };
const transactionOptions = { isolationLevel: "Serializable" as const, maxWait: 10_000, timeout: 30_000 };
const previewLifetime = 10 * 60 * 1000;
const id = z.string().trim().min(1).max(200);
const ids = (max: number) => z.array(id).min(1, "Pilih minimal satu item").max(max, `Maksimal ${max} item sekaligus`).refine(value => new Set(value).size === value.length, "Item tidak boleh dipilih dua kali");
const categoryFields = {
  name: z.string().trim().min(1, "Nama kategori wajib diisi").max(150, "Nama kategori maksimal 150 karakter"),
  icon: z.string().refine(isCategoryIconName, "Pilih ikon kategori yang tersedia").nullable(),
  color: z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, "Gunakan warna heksadesimal, misalnya #2563eb").nullable(),
  order: z.number().int("Urutan harus bilangan bulat").min(0, "Urutan tidak boleh negatif").max(2_147_483_647),
  salesGroup: z.enum(["ATK", "PAPER", "CARTRIDGE", "INK", "OTHER"]),
};
const draft = z.object(categoryFields).strict();
const createDraft = draft.extend({ icon: categoryFields.icon.default(null), color: categoryFields.color.default(null), order: categoryFields.order.default(0), salesGroup: categoryFields.salesGroup.default("OTHER") });
const patch = draft.partial().extend({ id }).strict().refine(value => Object.keys(value).length > 1, "Ubah minimal satu detail kategori");
const deleteFields = { categoryIds: ids(100), destinations: z.record(id, id) };
const moveFields = { productIds: ids(1000), targetCategoryId: id };
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), categories: z.array(createDraft).min(1).max(100) }).strict(),
  z.object({ action: z.literal("update"), categories: z.array(patch).min(1).max(100) }).strict(),
  z.object({ action: z.literal("preview-delete"), ...deleteFields }).strict(),
  z.object({ action: z.literal("delete"), ...deleteFields, token: z.string().max(300), acknowledged: z.literal(true, { error: "Setujui pernyataan dampak terlebih dahulu" }), confirmation: z.string() }).strict(),
  z.object({ action: z.literal("preview-move"), ...moveFields }).strict(),
  z.object({ action: z.literal("move"), ...moveFields, token: z.string().max(300), acknowledged: z.literal(true, { error: "Setujui dampak pemindahan terlebih dahulu" }) }).strict(),
]);

export class CategoryManagementError extends Error {
  constructor(public status: number, message: string, public errors?: Record<string, string[]>) {
    super(message);
    this.name = "CategoryManagementError";
  }
}

function conflict(): never {
  throw new CategoryManagementError(409, "Data atau pratinjau sudah berubah. Tinjau ulang dampaknya dan konfirmasi kembali.");
}

function signature(actor: Actor, snapshot: unknown, expiresAt: number) {
  const secret = process.env.CATEGORY_PREVIEW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AUTH_SECRET || process.env.DATABASE_URL;
  if (!secret) throw new CategoryManagementError(503, "Pratinjau aman belum tersedia. Hubungi pengelola untuk mengatur CATEGORY_PREVIEW_SECRET pada server.");
  return createHmac("sha256", secret).update(JSON.stringify(["category-preview-v1", actor.id, actor.role, actor.storeId, expiresAt, snapshot])).digest("hex");
}

function previewToken(actor: Actor, snapshot: unknown) {
  const expiresAt = Date.now() + previewLifetime;
  return { expiresAt, token: `${expiresAt}.${signature(actor, snapshot, expiresAt)}` };
}

function verifyToken(token: string, actor: Actor, snapshot: unknown) {
  const [expiry, actual, extra] = token.split(".");
  const expiresAt = Number(expiry);
  if (extra !== undefined || !Number.isSafeInteger(expiresAt) || expiresAt <= Date.now() || expiresAt > Date.now() + previewLifetime || !actual || !/^[a-f0-9]{64}$/.test(actual)) conflict();
  const expected = signature(actor, snapshot, expiresAt);
  if (!timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"))) conflict();
}

const categorySelect = { id: true, name: true, icon: true, color: true, order: true, salesGroup: true } as const;
const productSelect = { id: true, name: true, categoryId: true, storeId: true, stockGroupId: true, material: true, size: true, isActive: true, updatedAt: true, store: { select: { id: true, name: true } } } as const;
const groupSelect = { id: true, storeId: true, groupKey: true, updatedAt: true } as const;
const ruleInclude = { store: { select: { id: true, name: true } }, brand: { select: { name: true } } } as const;
type RuleRow = Prisma.CategoryCustomerPricingRuleGetPayload<{ include: typeof ruleInclude }>;
type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;
type GroupRow = Prisma.ProductStockGroupGetPayload<{ select: typeof groupSelect }>;

async function expandStockGroups(tx: Prisma.TransactionClient, selected: ProductRow[]) {
  const groupIds = [...new Set(selected.flatMap(product => product.stockGroupId ? [product.stockGroupId] : []))].sort();
  if (!groupIds.length) return { products: selected, groups: [] as GroupRow[] };

  const groups = await tx.productStockGroup.findMany({ where: { id: { in: groupIds } }, select: groupSelect, orderBy: { id: "asc" } });
  if (groups.length !== groupIds.length) conflict();
  const members = await tx.product.findMany({ where: { stockGroupId: { in: groupIds } }, select: productSelect, orderBy: { id: "asc" } });
  const groupStores = new Map(groups.map(group => [group.id, group.storeId]));
  if (members.some(member => member.stockGroupId && groupStores.get(member.stockGroupId) !== member.storeId)) conflict();
  const products = [...new Map([...selected, ...members].map(product => [product.id, product])).values()].sort((a, b) => a.id.localeCompare(b.id));
  return { products, groups };
}

async function planGroupKeys(tx: Prisma.TransactionClient, groups: GroupRow[], products: ProductRow[], destinations: ReadonlyMap<string, string>) {
  const plans: { group: GroupRow; groupKey: string }[] = [];
  const plannedKeys = new Map<string, string>();
  for (const group of groups) {
    const destination = destinations.get(group.id);
    if (!destination) continue;
    const members = products.filter(product => product.stockGroupId === group.id);
    if (!members.length) conflict();
    const groupKey = stockGroupKeyForCategory(group.groupKey, members, destination);
    if (groupKey === group.groupKey) continue;
    const scopedKey = JSON.stringify([group.storeId, groupKey]);
    if (plannedKeys.has(scopedKey)) throw new CategoryManagementError(409, "Kategori tujuan sudah memiliki grup stok dengan identitas yang sama. Periksa grup sebelum memindahkan produk.");
    plannedKeys.set(scopedKey, group.id);
    const existing = await tx.productStockGroup.findUnique({ where: { storeId_groupKey: { storeId: group.storeId, groupKey } }, select: { id: true } });
    if (existing && existing.id !== group.id) throw new CategoryManagementError(409, "Kategori tujuan sudah memiliki grup stok dengan identitas yang sama. Periksa grup sebelum memindahkan produk.");
    plans.push({ group, groupKey });
  }
  return plans;
}

async function lockCategoryGroups(tx: Prisma.TransactionClient, groups: GroupRow[], products: ProductRow[]) {
  const storeIds = [...new Set(groups.map(group => group.storeId))].sort();
  for (const storeId of storeIds) {
    const stockGroupIds = groups.filter(group => group.storeId === storeId).map(group => group.id);
    const productIds = products.filter(product => product.storeId === storeId).map(product => product.id);
    const locked = await lockStockMutationRows(tx, { storeId, stockGroupIds, productIds });
    if (locked.lockedStockGroupIds.length !== stockGroupIds.length || locked.lockedProductIds.length !== productIds.length) conflict();
  }
}

async function applyGroupKeys(tx: Prisma.TransactionClient, plans: Awaited<ReturnType<typeof planGroupKeys>>) {
  for (const { group, groupKey } of plans) {
    try {
      await tx.productStockGroup.update({ where: { id: group.id }, data: { groupKey } });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new CategoryManagementError(409, "Kategori tujuan sudah memiliki grup stok dengan identitas yang sama. Periksa grup sebelum memindahkan produk.");
      }
      throw error;
    }
  }
}

function ruleImpact(rule: RuleRow): PricingRuleImpact {
  return { id: rule.id, storeId: rule.storeId, storeName: rule.store.name, customerTypes: rule.customerTypes.length ? rule.customerTypes : rule.customerType ? [rule.customerType] : ["ALL"], unit: rule.units?.length ? rule.units.join(", ") : rule.unit, brandName: rule.brand?.name ?? null, mode: rule.mode, value: String(rule.value), isActive: rule.isActive };
}

function storeImpact(products: { storeId: string; store: { name: string } }[], rules: { storeId: string; store: { name: string } }[]): DeletePreview["stores"] {
  const stores = new Map<string, DeletePreview["stores"][number]>();
  for (const [items, field] of [[products, "products"], [rules, "rules"]] as const) {
    for (const item of items) {
      const store = stores.get(item.storeId) ?? { id: item.storeId, name: item.store.name, products: 0, rules: 0 };
      store[field]++;
      stores.set(store.id, store);
    }
  }
  return [...stores.values()].sort((a, b) => a.id.localeCompare(b.id));
}

async function saveCategories(tx: Prisma.TransactionClient, input: Extract<z.infer<typeof actionSchema>, { action: "create" | "update" }>): Promise<CategoryActionResult> {
  const existing = await tx.category.findMany({ orderBy: { id: "asc" }, select: categorySelect });
  const editing = input.action === "update" ? input.categories : [];
  if (new Set(editing.map(row => row.id)).size !== editing.length) throw new CategoryManagementError(422, "Kategori tidak boleh diedit dua kali dalam satu batch");
  const categories = input.categories.map((row, index) => {
    if (!("id" in row)) return row;
    const previous = existing.find(category => category.id === row.id);
    if (!previous) conflict();
    return { ...previous, ...row, rowIndex: index };
  });
  const names = categories.map(row => row.name!.toLocaleLowerCase("id-ID"));
  const errors: Record<string, string[]> = {};
  categories.forEach((row, index) => {
    const duplicateInBatch = names.indexOf(names[index]) !== index;
    const duplicateExisting = existing.some(other => other.name.toLocaleLowerCase("id-ID") === names[index] && (!("id" in row) || row.id !== other.id));
    if (duplicateInBatch || duplicateExisting) errors[`categories.${index}.name`] = ["Nama kategori sudah digunakan; pilih nama lain"];
  });
  if (Object.keys(errors).length) throw new CategoryManagementError(409, "Ada nama kategori yang sudah digunakan", errors);
  const saved = [];
  for (const row of input.categories) {
    if ("id" in row) {
      const { id: categoryId, ...data } = row;
      saved.push(await tx.category.update({ where: { id: categoryId }, data, include: { _count: { select: { products: true } } } }));
    } else {
      saved.push(await tx.category.create({ data: row, include: { _count: { select: { products: true } } } }));
    }
  }
  return { message: `${saved.length} kategori berhasil ${input.action === "create" ? "ditambahkan" : "diubah"}.`, categories: saved };
}

async function deleteCategories(tx: Prisma.TransactionClient, input: Extract<z.infer<typeof actionSchema>, { action: "preview-delete" | "delete" }>, actor: Actor): Promise<DeletePreview | CategoryActionResult> {
  const sourceIds = [...input.categoryIds].sort();
  if (Object.keys(input.destinations).some(key => !sourceIds.includes(key))) throw new CategoryManagementError(422, "Kategori asal tidak sesuai dengan pilihan");
  const destinations = Object.fromEntries(sourceIds.map(source => [source, input.destinations[source] || null]));
  const targetIds = Object.values(destinations).filter((value): value is string => value !== null);
  if (targetIds.some(target => sourceIds.includes(target))) throw new CategoryManagementError(422, "Kategori tujuan tidak boleh termasuk kategori yang dihapus");
  const allIds = [...new Set([...sourceIds, ...targetIds])].sort();
  const categories = await tx.category.findMany({ where: { id: { in: allIds } }, select: categorySelect, orderBy: { id: "asc" } });
  if (categories.length !== allIds.length) conflict();
  const products = await tx.product.findMany({ where: { categoryId: { in: sourceIds } }, select: productSelect, orderBy: { id: "asc" } });
  const rules = await tx.categoryCustomerPricingRule.findMany({ where: { categoryId: { in: allIds } }, include: ruleInclude, orderBy: { id: "asc" } });
  const sourceRules = rules.filter(rule => sourceIds.includes(rule.categoryId));
  if (actor.role !== "OWNER" && (sourceRules.length > 0 || products.some(product => product.storeId !== (actor.storeId || "store-main")))) {
    throw new CategoryManagementError(403, "Minta Owner menjalankan penghapusan ini karena memengaruhi aturan harga pelanggan atau produk di toko lain.");
  }
  const expanded = await expandStockGroups(tx, products);
  for (const group of expanded.groups) {
    const memberCategories = new Set(expanded.products.filter(product => product.stockGroupId === group.id).map(product => product.categoryId));
    if (memberCategories.size > 1) throw new CategoryManagementError(409, "Satuan dalam satu grup stok memiliki kategori berbeda. Pindahkan seluruh grup ke satu kategori sebelum menghapus kategori.");
  }
  const groupDestinations = new Map<string, string>();
  for (const group of expanded.groups) {
    const member = expanded.products.find(product => product.stockGroupId === group.id)!;
    const destination = destinations[member.categoryId];
    if (destination) groupDestinations.set(group.id, destination);
  }
  const groupPlans = await planGroupKeys(tx, expanded.groups, expanded.products, groupDestinations);
  const rows = sourceIds.map(source => {
    const category = categories.find(row => row.id === source)!;
    const sourceProducts = products.filter(product => product.categoryId === source);
    const activeProducts = sourceProducts.filter(product => product.isActive).length;
    const categoryRules = sourceRules.filter(rule => rule.categoryId === source);
    return { id: source, name: category.name, targetCategoryId: destinations[source], targetCategoryName: categories.find(row => row.id === destinations[source])?.name ?? null, products: sourceProducts.length, activeProducts, inactiveProducts: sourceProducts.length - activeProducts, rules: categoryRules.map(ruleImpact), stores: storeImpact(sourceProducts, categoryRules) };
  });
  const stores = storeImpact(products, sourceRules);
  const snapshot = { kind: "delete", sourceIds, destinations, categories, products, groups: expanded.groups, members: expanded.products, rules };
  if (input.action === "preview-delete") {
    const activeProducts = products.filter(product => product.isActive).length;
    return { kind: "delete", ...previewToken(actor, snapshot), categories: rows, totals: { categories: rows.length, products: products.length, activeProducts, inactiveProducts: products.length - activeProducts, rules: sourceRules.length, stores: stores.length }, stores };
  }
  if (input.confirmation !== `HAPUS ${sourceIds.length} KATEGORI`) throw new CategoryManagementError(422, `Ketik HAPUS ${sourceIds.length} KATEGORI untuk mengonfirmasi`);
  if (rows.some(row => row.products > 0 && !row.targetCategoryId)) throw new CategoryManagementError(422, "Pilih kategori tujuan untuk setiap kategori yang masih berisi produk");
  verifyToken(input.token, actor, snapshot);
  await lockCategoryGroups(tx, expanded.groups, expanded.products);
  if (expanded.groups.length) {
    const currentProducts = await tx.product.findMany({ where: { categoryId: { in: sourceIds } }, select: productSelect, orderBy: { id: "asc" } });
    const current = await expandStockGroups(tx, currentProducts);
    if (JSON.stringify(current) !== JSON.stringify(expanded)) conflict();
  }
  await applyGroupKeys(tx, groupPlans);
  let movedProducts = 0;
  for (const row of rows) {
    if (!row.products || !row.targetCategoryId) continue;
    const result = await tx.product.updateMany({ where: { categoryId: row.id }, data: { categoryId: row.targetCategoryId } });
    if (result.count !== row.products) conflict();
    movedProducts += result.count;
  }
  const removedRules = await tx.categoryCustomerPricingRule.deleteMany({ where: { categoryId: { in: sourceIds } } });
  if (removedRules.count !== sourceRules.length) conflict();
  const removedCategories = await tx.category.deleteMany({ where: { id: { in: sourceIds } } });
  if (removedCategories.count !== sourceIds.length) conflict();
  return { message: `${removedCategories.count} kategori dihapus, ${movedProducts} produk dipindahkan, dan ${removedRules.count} aturan harga dihapus.`, deletedCategories: removedCategories.count, movedProducts, deletedRules: removedRules.count };
}

async function moveProducts(tx: Prisma.TransactionClient, input: Extract<z.infer<typeof actionSchema>, { action: "preview-move" | "move" }>, actor: Actor): Promise<MovePreview | CategoryActionResult> {
  const productIds = [...input.productIds].sort();
  const storeId = actor.storeId || "store-main";
  const selected = await tx.product.findMany({ where: { id: { in: productIds }, storeId }, select: productSelect, orderBy: { id: "asc" } });
  if (selected.length !== productIds.length) conflict();
  const expanded = await expandStockGroups(tx, selected);
  const { products, groups } = expanded;
  if (products.some(product => product.storeId !== storeId)) conflict();
  const categoryIds = [...new Set([input.targetCategoryId, ...products.map(product => product.categoryId)])].sort();
  const categories = await tx.category.findMany({ where: { id: { in: categoryIds } }, select: categorySelect, orderBy: { id: "asc" } });
  const target = categories.find(category => category.id === input.targetCategoryId);
  if (!target) conflict();
  const rules = await tx.categoryCustomerPricingRule.findMany({ where: { categoryId: { in: categoryIds }, storeId }, include: ruleInclude, orderBy: { id: "asc" } });
  const movingIds = products.filter(product => product.categoryId !== target.id).map(product => product.id);
  const groupPlans = await planGroupKeys(tx, groups, products, new Map(groups.map(group => [group.id, target.id])));
  const snapshot = { kind: "move", productIds, targetCategoryId: target.id, categories, products, groups, rules };
  if (input.action === "preview-move") {
    return { kind: "move", ...previewToken(actor, snapshot), targetCategoryId: target.id, targetCategoryName: target.name, totals: { products: movingIds.length, unchanged: products.length - movingIds.length }, origins: categories.map(category => ({ id: category.id, name: category.name, products: products.filter(product => product.categoryId === category.id).length })).filter(origin => origin.products > 0) };
  }
  verifyToken(input.token, actor, snapshot);
  await lockCategoryGroups(tx, groups, products);
  if (groups.length) {
    const currentSelected = await tx.product.findMany({ where: { id: { in: productIds }, storeId }, select: productSelect, orderBy: { id: "asc" } });
    const current = await expandStockGroups(tx, currentSelected);
    if (JSON.stringify(current) !== JSON.stringify(expanded)) conflict();
  }
  await applyGroupKeys(tx, groupPlans);
  let movedProducts = 0;
  if (movingIds.length) {
    const moved = await tx.product.updateMany({ where: { id: { in: movingIds }, storeId }, data: { categoryId: target.id } });
    if (moved.count !== movingIds.length) conflict();
    movedProducts = moved.count;
  }
  return { message: `${movedProducts} produk berhasil dipindahkan ke ${target.name}.`, movedProducts, unchangedProducts: products.length - movingIds.length };
}

export async function executeCategoryAction(raw: unknown, actor: Actor): Promise<CategoryActionResult | DeletePreview | MovePreview> {
  const parsed = actionSchema.safeParse(raw);
  if (!parsed.success) {
    const errors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) (errors[issue.path.join(".")] ??= []).push(issue.message);
    throw new CategoryManagementError(422, "Periksa kembali isian kategori atau konfirmasi Anda.", errors);
  }
  const input = parsed.data;
  return db.$transaction(async tx => {
    if (input.action === "create" || input.action === "update") return saveCategories(tx, input);
    if (input.action === "preview-delete" || input.action === "delete") return deleteCategories(tx, input, actor);
    return moveProducts(tx, input, actor);
  }, transactionOptions);
}
