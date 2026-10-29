import { z } from "zod";
import type { Prisma } from "@pos/db";
import { isPricingCustomerType, isPricingMode, normalizePricingUnits, type CustomerType, type PricingCustomerType } from "./pricing-rules";

const target = z.string().refine(isPricingCustomerType, "Tipe pelanggan tidak valid");
const fields = {
  categoryId: z.string().min(1, "Kategori wajib dipilih"),
  customerType: target.optional(),
  customerTypes: z.array(target).min(1, "Pilih minimal satu tipe pelanggan").optional(),
  unit: z.string().nullable().optional(),
  units: z.array(z.string().trim().min(1)).optional(),
  brandId: z.string().nullable().optional(),
  mode: z.string().refine(isPricingMode, "Cara hitung harga tidak valid"),
  value: z.coerce.number().finite("Nilai harus berupa angka yang valid").nonnegative("Nilai tidak boleh negatif"),
  discountPercent: z.number().finite().min(0, "Potongan minimal 0%").max(100, "Potongan maksimal 100%").optional(),
  isActive: z.boolean().optional(),
};

function validateTargets(input: { customerType?: string; customerTypes?: string[] }, ctx: z.RefinementCtx) {
  if (input.customerTypes?.includes("ALL") && input.customerTypes.length !== 1) {
    ctx.addIssue({ code: "custom", path: ["customerTypes"], message: "Semua pelanggan tidak dapat digabung dengan tipe lain" });
  }
  if (input.customerTypes && new Set(input.customerTypes).size !== input.customerTypes.length) {
    ctx.addIssue({ code: "custom", path: ["customerTypes"], message: "Tipe pelanggan tidak boleh dipilih dua kali" });
  }
  if (input.customerType && input.customerTypes && (input.customerTypes.length !== 1 || input.customerTypes[0] !== input.customerType)) {
    ctx.addIssue({ code: "custom", path: ["customerTypes"], message: "Pilihan tipe pelanggan tidak sesuai" });
  }
}

export const pricingRuleSchema = z.object(fields).superRefine((input, ctx) => {
  validateTargets(input, ctx);
  if (!input.customerType && !input.customerTypes) ctx.addIssue({ code: "custom", path: ["customerTypes"], message: "Pilih minimal satu tipe pelanggan" });
  if ((input.mode === "FLAT_DISCOUNT" || input.mode === "PERCENT_DISCOUNT") && input.value <= 0) ctx.addIssue({ code: "custom", path: ["value"], message: "Diskon harus lebih dari 0" });
  if (input.mode === "PERCENT_DISCOUNT" && input.value > 100) ctx.addIssue({ code: "custom", path: ["value"], message: "Diskon maksimal 100%" });
  if (input.mode === "UNIT_COST_PLUS_PERCENT_DISCOUNT" && input.discountPercent == null) ctx.addIssue({ code: "custom", path: ["discountPercent"], message: "Isi persentase potongan" });
});

export const pricingRulePatchSchema = z.object(fields).partial().superRefine((input, ctx) => {
  validateTargets(input, ctx);
  if (!Object.keys(input).length) ctx.addIssue({ code: "custom", path: ["_form"], message: "Tidak ada isian yang diubah" });
});

type StoredTargets = { customerType?: CustomerType | null; customerTypes?: CustomerType[] };
export function readCustomerTargets(rule: StoredTargets): PricingCustomerType[] {
  if (rule.customerTypes !== undefined) return rule.customerTypes.length ? rule.customerTypes : ["ALL"];
  return [rule.customerType ?? "ALL"];
}

export function serializePricingRule<T extends StoredTargets & { value: unknown; discountPercent?: unknown }>(rule: T) {
  const customerTypes = readCustomerTargets(rule);
  return { ...rule, customerTypes, customerType: customerTypes.length === 1 ? customerTypes[0] : "ALL", value: Number(rule.value), ...(rule.discountPercent != null ? { discountPercent: Number(rule.discountPercent) } : {}) };
}

export function storedCustomerTargets(input: { customerType?: string; customerTypes?: string[] }) {
  const targets = input.customerTypes ?? [input.customerType ?? "ALL"];
  const customerTypes = targets.includes("ALL") ? [] : targets as CustomerType[];
  return { customerTypes, customerType: customerTypes.length === 1 ? customerTypes[0] : null };
}

export const pricingRuleInclude = {
  category: { select: { id: true, name: true, icon: true, color: true } },
  brand: { select: { id: true, name: true, normalizedName: true } },
} as const;

// Remote database round trips can exceed Prisma's default five-second budget.
export const pricingRuleTransactionOptions = { maxWait: 5000, timeout: 15000 };

export async function lockPricingRules(tx: Prisma.TransactionClient, storeId: string) {
  // A store-wide lock also covers rules moving between category/unit/brand scopes.
  // PostgreSQL returns void for this lock; Prisma raw results need a supported type.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`customer-pricing:${storeId}`}, 0))::text`;
}

export async function hasOverlappingPricingRule(tx: Prisma.TransactionClient, input: {
  storeId: string; categoryId: string; customerType?: CustomerType | null; customerTypes: CustomerType[];
  unit: string | null; units?: string[]; brandId: string | null; excludeId?: string;
}) {
  const units = normalizePricingUnits(input.units, input.unit);
  const others = await tx.categoryCustomerPricingRule.findMany({
    where: { storeId: input.storeId, categoryId: input.categoryId, brandId: input.brandId, isActive: true, ...(input.excludeId ? { id: { not: input.excludeId } } : {}) },
    select: { id: true, customerType: true, customerTypes: true, unit: true, units: true },
  });
  return others.some((other) => {
    const otherUnits = normalizePricingUnits(other.units, other.unit);
    if (units.length === 0 ? otherUnits.length !== 0 : !otherUnits.some((unit) => units.includes(unit))) return false;
    const targets = readCustomerTargets(other);
    const all = targets.includes("ALL");
    return input.customerTypes.length === 0 ? all : !all && targets.some((type) => input.customerTypes.includes(type as CustomerType));
  });
}

export const overlapMessage = "Sudah ada aturan aktif untuk pelanggan, kategori, satuan, dan merek ini. Ubah aturan yang ada atau pilih pelanggan lain.";
