import { z } from "zod";

const money = z.union([z.number().finite().nonnegative(), z.string().regex(/^\d+(?:\.\d+)?$/)]);
export const pricingMemberChangeSchema = z.object({
  productId: z.string().min(1), mode: z.enum(["AUTO", "MANUAL"]).optional(),
  factor: z.object({ numerator: z.string().regex(/^\d+$/), denominator: z.string().regex(/^[1-9]\d*$/) }).optional(),
  price: money.optional(), costPrice: money.nullable().optional(),
});
export const groupPricingChangesSchema = z.object({
  sourceProductId: z.string().min(1).optional(), members: z.array(pricingMemberChangeSchema).optional(),
});
export const groupPricingRequestSchema = z.object({
  changes: groupPricingChangesSchema,
  expectedVersion: z.string().min(1).optional(), expectedProjection: z.string().min(1).optional(),
  note: z.string().trim().nullable().optional(),
});
